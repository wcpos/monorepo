/**
 * @jest-environment jsdom
 *
 * THE THREE FAULT-COUNTER FAMILIES, over ONE queue (#1561).
 *
 * Six numbers across the health screens answer "how much is wrong /
 * outstanding". They use three definitions, and two of them CONTRADICT each
 * other deliberately: the same held open cart is unsent work (a reset destroys
 * it) and is NOT sync backlog (nothing is stuck — the cashier is still typing).
 *
 * That disagreement used to survive only in prose, so it read as an
 * inconsistency rather than a design, and the cheap move on spotting it is to
 * make the numbers match — which makes both wrong. These tests pin each
 * family's exclusion rule against a single fixture queue holding one row of
 * every kind the families disagree about, so "does this count held carts?" is
 * answered by a name and an assertion instead of by reading three
 * implementations.
 *
 * The vocabulary itself lives in CONTEXT.md § Language — Fault counters.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { MUTATION_QUEUE_RXDB_COLLECTION } from '@wcpos/sync-engine';
import type { QueueRow as EngineQueueRow, RxdbSyncEngine } from '@wcpos/sync-engine';
import { observeUnsentWorkCount } from '@wcpos/query';
import { forgetUnsentChanges } from '@wcpos/utils/unsent-changes';

import { useMutationCounts } from './use-engine-monitor';
import { countUnsentChanges } from './use-unsent-changes';

type QueueRow = Omit<EngineQueueRow, 'payload' | 'queuedAt' | 'origin' | 'baseRevision'>;
type FakeDatabase = { collections: Record<string, unknown> };

/** The record a cart is open on — the row the two families disagree about. */
const OPEN_CART_RECORD = 'order-open';

/** Terminal statuses: rows waiting on a HUMAN, never on the network. */
const TERMINAL_STATUSES = ['conflicted', 'needs-revision', 'rejected'];

/**
 * One queue, one row of every kind. Every expected number below is derived from
 * this list, so a new row kind forces every family to state what it does with it.
 */
const QUEUE: QueueRow[] = [
	// Waiting on the store. Every family counts this one.
	{
		mutationId: 'm-network',
		collectionName: 'products',
		operation: 'update',
		recordId: 'product-1',
		status: 'pending',
	},
	// Held by the engine while its cart is open (#1546) — unsent, but not stuck.
	{
		mutationId: 'm-held',
		collectionName: 'orders',
		operation: 'update',
		recordId: OPEN_CART_RECORD,
		status: 'pending',
	},
	// Terminal: a 409 the till has to decide about.
	{
		mutationId: 'm-conflicted',
		collectionName: 'orders',
		operation: 'update',
		recordId: 'order-1',
		status: 'conflicted',
	},
	{
		mutationId: 'm-needs-revision',
		collectionName: 'products',
		operation: 'update',
		recordId: 'product-2',
		status: 'needs-revision',
	},
	// Terminal: a dead letter (#832) — permanently refused, nothing will retry it.
	{
		mutationId: 'm-rejected',
		collectionName: 'orders',
		operation: 'create',
		recordId: 'order-2',
		status: 'rejected',
	},
];

const mockDatabase$ = new BehaviorSubject<FakeDatabase | null>(null);
const mockQueueRows$ = new BehaviorSubject<readonly EngineQueueRow[] | null>(null);
const mockEngine = {
	queueRows$: (cb: (rows: readonly EngineQueueRow[] | null) => void) => {
		const subscription = mockQueueRows$.subscribe(cb);
		return () => subscription.unsubscribe();
	},
	ready: new Promise(() => {}),
	active: () => {
		const database = mockDatabase$.value;
		return database ? { database } : null;
	},
	db$: (cb: (database: FakeDatabase | null) => void) => {
		const subscription = mockDatabase$.subscribe(cb);
		return () => subscription.unsubscribe();
	},
};

jest.mock('@wcpos/query', () => ({
	observeUnsentWorkCount: jest.fn(jest.requireActual('@wcpos/query').observeUnsentWorkCount),
	observeQueueCounts: jest.fn(jest.requireActual('@wcpos/query').observeQueueCounts),
	useQueryRuntime: () => ({ engine: mockEngine }),
}));

/** The unsent-work read still consumes stored rows; counts use the typed door below. */
function fakeQueue(rows: readonly QueueRow[]) {
	const count = jest.fn((query?: { selector?: { status?: string | { $in: string[] } } }) => {
		const status = query?.selector?.status;
		const counted =
			typeof status === 'string'
				? rows.filter((row) => row.status === status)
				: status?.$in
					? rows.filter((row) => status.$in.includes(row.status ?? 'pending'))
					: rows;
		return {
			$: new BehaviorSubject(counted.length),
			exec: () => Promise.resolve(counted.length),
		};
	});
	const find = jest.fn((query?: { selector: { status: { $in: string[] } } }) => {
		const selected = rows
			.filter((row) => !query || query.selector.status.$in.includes(row.status ?? 'pending'))
			.map((row) => ({ ...row, toJSON: () => row }));
		return { $: new BehaviorSubject(selected), exec: async () => selected };
	});
	return { count, find };
}

/** An `orders` collection answering the open-cart query with these record ids. */
function fakeOrders(uuids: readonly string[]) {
	return {
		find: jest.fn(() => ({
			$: new BehaviorSubject(uuids.map((uuid) => ({ uuid }))),
		})),
	};
}

function mountQueue(rows: readonly QueueRow[], openCartRecordIds: readonly string[]) {
	const queue = fakeQueue(rows);
	const database: FakeDatabase = {
		collections: {
			[MUTATION_QUEUE_RXDB_COLLECTION]: queue,
			orders: fakeOrders(openCartRecordIds),
		},
	};
	mockQueueRows$.next(
		rows.map((row) => ({
			...row,
			payload: {},
			queuedAt: '',
			origin: 'existing',
			baseRevision: null,
		}))
	);
	mockDatabase$.next(database);
	return { queue, engine: mockEngine as unknown as RxdbSyncEngine };
}

beforeEach(() => {
	forgetUnsentChanges();
});

afterEach(() => {
	mockDatabase$.next(null);
	mockQueueRows$.next(null);
});

describe('Unsent work — "is it safe to reset?"', () => {
	it('counts the WHOLE queue: the held cart and the terminal rows included', async () => {
		// A reset destroys every row here, held carts and dead letters alike, so a
		// row hidden from this number is a sale nobody was warned about losing.
		const { engine } = mountQueue(QUEUE, [OPEN_CART_RECORD]);

		await expect(countUnsentChanges(engine)).resolves.toEqual({
			status: 'some',
			count: QUEUE.length,
		});
	});

	it('the named read counts all rows minus internal coordination rows', async () => {
		// Bare find preserves status-less legacy rows; exclusion happens in one snapshot.
		const { engine, queue } = mountQueue(QUEUE, [OPEN_CART_RECORD]);

		await countUnsentChanges(engine);

		expect(observeUnsentWorkCount).toHaveBeenCalledWith(engine, { snapshot: true });
		expect(queue.find.mock.calls).toEqual([[]]);
	});
});

describe('Sync backlog — "is sync healthy?"', () => {
	it('excludes the by-design hold and every terminal row', () => {
		// Only `m-network` is actually waiting on the store: the held cart is
		// waiting on the cashier, the three terminal rows on a human decision.
		mountQueue(QUEUE, [OPEN_CART_RECORD]);
		const { result, unmount } = renderHook(() => useMutationCounts());

		expect(result.current.syncBacklog).toBe(1);

		unmount();
	});

	it('never selects a terminal status', () => {
		mountQueue(
			QUEUE.filter((row) => TERMINAL_STATUSES.includes(row.status)),
			[]
		);
		const { result, unmount } = renderHook(() => useMutationCounts());

		expect(result.current.syncBacklog).toBe(0);
		expect(result.current.syncBacklogSales).toBe(0);

		unmount();
	});
});

describe('Needs a decision — "what must someone act on?"', () => {
	it('covers every terminal status, and its two halves partition it', () => {
		mountQueue(QUEUE, [OPEN_CART_RECORD]);
		const { result, unmount } = renderHook(() => useMutationCounts());

		expect(result.current.needsDecision).toBe(3);
		// A 409 and a permanent refusal are different problems with different
		// fixes (#832), so they are counted apart — but between them they must
		// account for the whole family, or a row needing a human is in no panel.
		expect(result.current.needsDecisionRejected).toBe(1);
		expect(result.current.needsDecisionUnresolved).toBe(2);
		expect(result.current.needsDecisionRejected + result.current.needsDecisionUnresolved).toBe(
			result.current.needsDecision
		);

		unmount();
	});

	it('splits the same status list the whole family selects', () => {
		for (const status of TERMINAL_STATUSES) {
			mountQueue(
				QUEUE.filter((row) => row.status === status),
				[]
			);
			const { result, unmount } = renderHook(() => useMutationCounts());
			expect(result.current.needsDecision).toBe(1);
			expect(result.current.needsDecisionRejected).toBe(status === 'rejected' ? 1 : 0);
			expect(result.current.needsDecisionUnresolved).toBe(status === 'rejected' ? 0 : 1);
			unmount();
		}
	});
});

describe('the families disagree ON PURPOSE', () => {
	it('counts one held open cart as unsent work and NOT as sync backlog', async () => {
		// The headline contradiction, on a queue holding nothing else. Making
		// these two numbers agree — in either direction — breaks one of them: the
		// reset confirm would stop warning about a sale it is about to destroy, or
		// the health stat would show a red "1 change waiting to send" whose change
		// is the cart open in front of the cashier (#1546).
		const held = QUEUE.filter((row) => row.mutationId === 'm-held');
		const { engine } = mountQueue(held, [OPEN_CART_RECORD]);
		const { result, unmount } = renderHook(() => useMutationCounts());

		await expect(countUnsentChanges(engine)).resolves.toEqual({ status: 'some', count: 1 });
		expect(result.current.syncBacklog).toBe(0);

		unmount();
	});
});

describe('the vocabulary', () => {
	it('CONTEXT.md names all three families', () => {
		// The names are the fix. A counter family with no definition to point at
		// is the defect this issue was filed about.
		const context = readFileSync(join(__dirname, '../../../../../../CONTEXT.md'), 'utf8');

		expect(context).toContain('## Language — Fault counters');
		expect(context).toContain('**Unsent work**');
		expect(context).toContain('**Sync backlog**');
		expect(context).toContain('**Needs a decision**');
	});

	it('every mutation counter declares its family in its name', () => {
		mountQueue(QUEUE, [OPEN_CART_RECORD]);
		const { result, unmount } = renderHook(() => useMutationCounts());

		expect(Object.keys(result.current).length).toBeGreaterThan(0);
		for (const key of Object.keys(result.current)) {
			expect(key).toMatch(/^(syncBacklog|needsDecision)/);
		}

		unmount();
	});
});
