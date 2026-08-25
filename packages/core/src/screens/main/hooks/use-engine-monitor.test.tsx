/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

import {
	MUTATION_QUEUE_RXDB_COLLECTION,
	OPEN_CART_ORDER_STATUS,
	SYNC_COLLECTION_NAMES,
} from '@wcpos/sync-engine';
import type { HoldCandidate } from '@wcpos/sync-engine';

import { useCollectionCounts, useMutationCounts } from './use-engine-monitor';

type FakeDatabase = { collections: Record<string, unknown> };
type QueueRow = HoldCandidate & { mutationId: string };

const mockDatabase$ = new BehaviorSubject<FakeDatabase | null>(null);
const mockEngine = {
	db$: (cb: (database: FakeDatabase | null) => void) => {
		const subscription = mockDatabase$.subscribe(cb);
		return () => subscription.unsubscribe();
	},
};
const mockObserveEngineDatabases = () => mockDatabase$.pipe(distinctUntilChanged());

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: mockEngine }),
	observeEngineDatabases: () => mockObserveEngineDatabases(),
}));

function countDatabase(offset: number) {
	const counts = Object.fromEntries(
		SYNC_COLLECTION_NAMES.map((name, index) => [name, new BehaviorSubject(offset + index)])
	) as Record<(typeof SYNC_COLLECTION_NAMES)[number], BehaviorSubject<number>>;
	return {
		counts,
		database: {
			collections: Object.fromEntries(
				SYNC_COLLECTION_NAMES.map((name) => [name, { count: () => ({ $: counts[name] }) }])
			),
		},
	};
}

/** A queue row as the hook reads it: an RxDB document face over the stored row. */
function queueRow(row: Partial<QueueRow> = {}) {
	const value: QueueRow = {
		mutationId: 'mutation-1',
		collectionName: 'products',
		operation: 'update',
		recordId: 'record-1',
		status: 'pending',
		...row,
	};
	return { toJSON: () => value };
}

/** An `orders` collection answering the open-cart query with these record ids. */
function openCartOrders(uuids: string[]) {
	const orders$ = new BehaviorSubject(uuids.map((uuid) => ({ toJSON: () => ({ uuid }) })));
	const find = jest.fn((query: { selector: { status: { $eq: string } } }) => {
		expect(query.selector.status.$eq).toBe(OPEN_CART_ORDER_STATUS);
		return { $: orders$ };
	});
	return { orders$, find, collection: { find } };
}

/** Build a mutation collection fixture with independent observable count streams. */
function mutationDatabase(
	syncBacklog: number,
	needsDecision: number,
	needsDecisionRejected = 0,
	needsDecisionUnresolved = needsDecision - needsDecisionRejected
) {
	const syncBacklog$ = new BehaviorSubject(
		Array.from({ length: syncBacklog }, (_unused, index) =>
			queueRow({ mutationId: `mutation-${index}`, recordId: `record-${index}` })
		)
	);
	const needsDecision$ = new BehaviorSubject(Array.from({ length: needsDecision }, () => ({})));
	const needsDecisionRejected$ = new BehaviorSubject(
		Array.from({ length: needsDecisionRejected }, () => ({}))
	);
	const needsDecisionUnresolved$ = new BehaviorSubject(
		Array.from({ length: needsDecisionUnresolved }, () => ({}))
	);
	const find = jest.fn(
		(query: { selector: { status: { $in: string[] }; collectionName?: { $eq: string } } }) => {
			const statuses = query.selector.status.$in;
			// The dead-letter-only query (#832) is the single-status one; the lumped
			// terminal query also mentions 'rejected' but names two more statuses.
			if (statuses.length === 1 && statuses[0] === 'rejected') return { $: needsDecisionRejected$ };
			if (statuses.includes('rejected')) return { $: needsDecision$ };
			if (statuses.length === 2 && statuses.includes('conflicted'))
				return { $: needsDecisionUnresolved$ };
			return { $: syncBacklog$ };
		}
	);
	return {
		syncBacklog$,
		needsDecisionRejected$,
		needsDecisionUnresolved$,
		find,
		database: {
			collections: { [MUTATION_QUEUE_RXDB_COLLECTION]: { find } } as Record<string, unknown>,
		},
	};
}

describe('engine monitor hooks', () => {
	afterEach(() => mockDatabase$.next(null));

	it('documents the sync backlog as network-waiting mutations', () => {
		const source = readFileSync(join(__dirname, 'use-engine-monitor.ts'), 'utf8');

		expect(source).toContain(
			'Every outbound record waiting for the network (`pending` or `claimed`),'
		);
		expect(source).toContain('MINUS the rows the engine holds by design while their cart is open');
		expect(source).not.toContain('Every queued outbound record');
	});

	it('re-subscribes collection counts after a same-database reset', () => {
		const first = countDatabase(1);
		const reset = countDatabase(11);
		mockDatabase$.next(first.database);
		const { result, unmount } = renderHook(() => useCollectionCounts());

		expect(result.current).toEqual(
			Object.fromEntries(SYNC_COLLECTION_NAMES.map((name, index) => [name, index + 1]))
		);
		act(() => {
			first.database.collections = reset.database.collections;
			mockDatabase$.next(first.database);
		});
		expect(result.current).toEqual(
			Object.fromEntries(SYNC_COLLECTION_NAMES.map((name, index) => [name, index + 11]))
		);
		act(() => first.counts.orders.next(99));
		expect(result.current.orders).toBe(11);
		act(() => reset.counts.orders.next(50));
		expect(result.current.orders).toBe(50);

		unmount();
	});

	it('counts every queued outbound record as a change waiting to send', () => {
		// No per-collection carve-out: a stuck product edit counts exactly like a
		// stuck sale (Paul, 2026-08-08), so the hook issues no collectionName query.
		// That ruling is about COLLECTIONS. The status list is narrower: only work
		// waiting on the network counts. `conflicted`/`needs-revision` wait on a
		// human and render in their own panels, so counting them here inflated the
		// stat and reported one record in two places at once.
		const mutations = mutationDatabase(3, 0);
		mockDatabase$.next(mutations.database);
		const { result, unmount } = renderHook(() => useMutationCounts());

		expect(mutations.find).toHaveBeenCalledWith({
			selector: {
				status: { $in: ['pending', 'claimed'] },
			},
		});
		for (const call of mutations.find.mock.calls) {
			expect(call[0].selector.collectionName).toBeUndefined();
		}
		expect(result.current).toEqual({
			syncBacklog: 3,
			needsDecision: 0,
			needsDecisionRejected: 0,
			needsDecisionUnresolved: 0,
		});
		act(() => mutations.syncBacklog$.next([queueRow()]));
		expect(result.current).toEqual({
			syncBacklog: 1,
			needsDecision: 0,
			needsDecisionRejected: 0,
			needsDecisionUnresolved: 0,
		});

		unmount();
	});

	it("does not count an open cart's held edit as a change waiting to send (#1546)", () => {
		// The engine HOLDS a pos-open order's queued edits until the sale settles
		// (write-drain-lane shouldHold). Counting them told the cashier a change was
		// stuck with nothing anywhere to act on — the change was the cart in front
		// of them. The moment the cart leaves pos-open the row is on its way again
		// and the stat must say so.
		const mutations = mutationDatabase(0, 0);
		const orders = openCartOrders(['order-1']);
		mutations.database.collections.orders = orders.collection;
		mutations.syncBacklog$.next([
			queueRow({ mutationId: 'mutation-1', collectionName: 'orders', recordId: 'order-1' }),
		]);
		mockDatabase$.next(mutations.database);
		const { result, unmount } = renderHook(() => useMutationCounts());

		expect(result.current.syncBacklog).toBe(0);

		act(() => orders.orders$.next([]));
		expect(result.current.syncBacklog).toBe(1);

		unmount();
	});

	it('counts a cashier-triggered push on an open cart — the hold releases it', () => {
		// `explicit` is the cashier asking for the push (and a delete is a release):
		// the drain sends the record's whole chain, so neither row is held and the
		// stat must not hide work that IS on its way to the store.
		const mutations = mutationDatabase(0, 0);
		const orders = openCartOrders(['order-1']);
		mutations.database.collections.orders = orders.collection;
		mutations.syncBacklog$.next([
			queueRow({ mutationId: 'mutation-1', collectionName: 'orders', recordId: 'order-1' }),
			queueRow({
				mutationId: 'mutation-2',
				collectionName: 'orders',
				recordId: 'order-1',
				explicit: true,
			}),
		]);
		mockDatabase$.next(mutations.database);
		const { result, unmount } = renderHook(() => useMutationCounts());

		expect(result.current.syncBacklog).toBe(2);

		unmount();
	});

	it('counts a claimed row on an open cart — the push is already in flight', () => {
		const mutations = mutationDatabase(0, 0);
		const orders = openCartOrders(['order-1']);
		mutations.database.collections.orders = orders.collection;
		mutations.syncBacklog$.next([
			queueRow({
				mutationId: 'mutation-1',
				collectionName: 'orders',
				recordId: 'order-1',
				status: 'claimed',
			}),
		]);
		mockDatabase$.next(mutations.database);
		const { result, unmount } = renderHook(() => useMutationCounts());

		expect(result.current.syncBacklog).toBe(1);

		unmount();
	});

	it('counts dead letters as their own number, not lumped into the conflict count (#832)', () => {
		// A 409 conflict and a permanently-refused write are different problems with
		// different fixes; the Database tab shows a callout for one and an actionable
		// list for the other, so it needs both numbers.
		const mutations = mutationDatabase(0, 3, 2);
		mockDatabase$.next(mutations.database);
		const { result, unmount } = renderHook(() => useMutationCounts());

		expect(mutations.find).toHaveBeenCalledWith({ selector: { status: { $in: ['rejected'] } } });
		expect(result.current).toEqual({
			syncBacklog: 0,
			needsDecision: 3,
			needsDecisionRejected: 2,
			needsDecisionUnresolved: 1,
		});
		act(() => mutations.needsDecisionRejected$.next([]));
		expect(result.current).toEqual({
			syncBacklog: 0,
			needsDecision: 3,
			needsDecisionRejected: 0,
			needsDecisionUnresolved: 1,
		});

		unmount();
	});

	it('re-runs mutation queries after a same-database reset', () => {
		const first = mutationDatabase(3, 0);
		const reset = mutationDatabase(5, 1);
		mockDatabase$.next(first.database);
		const { result, unmount } = renderHook(() => useMutationCounts());

		expect(result.current).toMatchObject({
			syncBacklog: 3,
			needsDecision: 0,
			needsDecisionRejected: 0,
		});
		act(() => {
			first.database.collections = reset.database.collections;
			mockDatabase$.next(first.database);
		});
		expect(result.current).toMatchObject({
			syncBacklog: 5,
			needsDecision: 1,
			needsDecisionRejected: 0,
		});
		act(() => first.syncBacklog$.next([]));
		expect(result.current).toMatchObject({
			syncBacklog: 5,
			needsDecision: 1,
			needsDecisionRejected: 0,
		});

		unmount();
	});
});
