/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { MUTATION_QUEUE_RXDB_COLLECTION, SYNC_COLLECTION_NAMES } from '@wcpos/sync-engine';

import { useCollectionCounts, useMutationCounts } from './use-engine-monitor';

type FakeDatabase = { collections: Record<string, unknown> };

const mockDatabase$ = new BehaviorSubject<FakeDatabase | null>(null);
const mockEngine = { database$: mockDatabase$ };

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: mockEngine }),
	observeEngineDatabases: () => mockDatabase$,
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

function mutationDatabase(pending: number, conflicts: number, pendingOrders = pending) {
	const pending$ = new BehaviorSubject(Array.from({ length: pending }, () => ({})));
	const pendingOrders$ = new BehaviorSubject(Array.from({ length: pendingOrders }, () => ({})));
	const conflicts$ = new BehaviorSubject(Array.from({ length: conflicts }, () => ({})));
	const find = jest.fn(
		(query: { selector: { status: { $in: string[] }; collectionName?: { $eq: string } } }) => ({
			$: query.selector.status.$in.includes('rejected')
				? conflicts$
				: query.selector.collectionName
					? pendingOrders$
					: pending$,
		})
	);
	return {
		pendingOrders$,
		find,
		database: {
			collections: { [MUTATION_QUEUE_RXDB_COLLECTION]: { find } },
		},
	};
}

describe('engine monitor hooks', () => {
	afterEach(() => mockDatabase$.next(null));

	it('re-subscribes collection counts when the engine database changes', () => {
		const first = countDatabase(1);
		const second = countDatabase(11);
		mockDatabase$.next(first.database);
		const { result, unmount } = renderHook(() => useCollectionCounts());

		expect(result.current).toEqual(
			Object.fromEntries(SYNC_COLLECTION_NAMES.map((name, index) => [name, index + 1]))
		);
		act(() => mockDatabase$.next(second.database));
		expect(result.current).toEqual(
			Object.fromEntries(SYNC_COLLECTION_NAMES.map((name, index) => [name, index + 11]))
		);
		act(() => first.counts.orders.next(99));
		expect(result.current.orders).toBe(11);
		act(() => second.counts.orders.next(50));
		expect(result.current.orders).toBe(50);

		unmount();
	});

	it('counts only order mutations as sales waiting to send', () => {
		const mutations = mutationDatabase(3, 0, 1);
		mockDatabase$.next(mutations.database);
		const { result, unmount } = renderHook(() => useMutationCounts());

		expect(mutations.find).toHaveBeenCalledWith({
			selector: {
				status: { $in: ['pending', 'claimed', 'conflicted', 'needs-revision'] },
				collectionName: { $eq: 'orders' },
			},
		});
		expect(result.current).toEqual({ pending: 3, pendingOrders: 1, conflicts: 0 });
		act(() => mutations.pendingOrders$.next([]));
		expect(result.current).toEqual({ pending: 3, pendingOrders: 0, conflicts: 0 });

		unmount();
	});
});
