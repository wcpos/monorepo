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

import { MUTATION_QUEUE_RXDB_COLLECTION, OPEN_CART_ORDER_STATUS } from '@wcpos/sync-engine';
import type { HoldCandidate, RxdbSyncEngine } from '@wcpos/sync-engine';
import { forgetUnsentChanges } from '@wcpos/utils/unsent-changes';

import { useMutationCounts } from './use-engine-monitor';
import { countUnsentChanges } from './use-unsent-changes';

type QueueRow = HoldCandidate & { mutationId: string };
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
const mockEngine = {
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
	useQueryRuntime: () => ({ engine: mockEngine }),
}));

/**
 * A queue collection that answers BOTH readers off the same rows: `count()` (no
 * selector — how Unsent work reads it) and `find({selector})` (how the backlog
 * and needs-a-decision families read it). A row with no `status` counts as
 * pending, exactly as the queue schema treats it.
 */
function fakeQueue(rows: readonly QueueRow[]) {
	// The selector parameter is honoured rather than ignored on purpose: a reader
	// that starts passing one must make the WHOLE-queue count wrong, not just the
	// call-shape assertion below.
	const count = jest.fn((query?: { selector?: { status?: { $in: string[] } } }) => {
		const statuses = query?.selector?.status?.$in;
		const counted = statuses
			? rows.filter((row) => statuses.includes(row.status ?? 'pending'))
			: rows;
		return {
			$: new BehaviorSubject(counted.length),
			exec: () => Promise.resolve(counted.length),
		};
	});
	const find = jest.fn((query: { selector: { status: { $in: string[] } } }) => ({
		$: new BehaviorSubject(
			rows
				.filter((row) => query.selector.status.$in.includes(row.status ?? 'pending'))
				.map((row) => ({ toJSON: () => row }))
		),
	}));
	return { count, find };
}

/** An `orders` collection answering the open-cart query with these record ids. */
function fakeOrders(uuids: readonly string[]) {
	return {
		find: jest.fn(() => ({
			$: new BehaviorSubject(uuids.map((uuid) => ({ toJSON: () => ({ uuid }) }))),
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
	mockDatabase$.next(database);
	return { queue, engine: mockEngine as unknown as RxdbSyncEngine };
}

/** The `$in` list the hook used for the family whose selector names `status`. */
function statusSelectors(queue: ReturnType<typeof fakeQueue>): string[][] {
	return queue.find.mock.calls.map((call) => call[0].selector.status.$in);
}

beforeEach(() => {
	forgetUnsentChanges();
});

afterEach(() => {
	mockDatabase$.next(null);
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

	it('applies NO selector — this family’s exclusion rule is "none at all"', async () => {
		// The pin: `count()` is called bare. `status` is optional in the queue
		// schema (absent means pending), so ANY status selector both hides those
		// rows and quietly adopts another family's exclusions.
		const { engine, queue } = mountQueue(QUEUE, [OPEN_CART_RECORD]);

		await countUnsentChanges(engine);

		expect(queue.count).toHaveBeenCalled();
		for (const call of queue.count.mock.calls) expect(call).toEqual([]);
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
		const { queue } = mountQueue(QUEUE, [OPEN_CART_RECORD]);
		const { unmount } = renderHook(() => useMutationCounts());

		const backlog = statusSelectors(queue).find((statuses) => statuses.includes('pending'));
		expect(backlog).toEqual(['pending', 'claimed']);

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
		const { queue } = mountQueue(QUEUE, [OPEN_CART_RECORD]);
		const { unmount } = renderHook(() => useMutationCounts());

		const selectors = statusSelectors(queue);
		const whole = selectors.find(
			(statuses) => statuses.includes('rejected') && statuses.length > 1
		);
		const rejected = selectors.find(
			(statuses) => statuses.length === 1 && statuses[0] === 'rejected'
		);
		const unresolved = selectors.find(
			(statuses) => statuses.includes('conflicted') && !statuses.includes('rejected')
		);

		expect([...(whole ?? [])].sort()).toEqual([...TERMINAL_STATUSES].sort());
		expect([...(rejected ?? []), ...(unresolved ?? [])].sort()).toEqual(
			[...TERMINAL_STATUSES].sort()
		);

		unmount();
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
