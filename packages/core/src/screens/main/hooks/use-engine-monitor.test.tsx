/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

import { MUTATION_QUEUE_RXDB_COLLECTION, SYNC_COLLECTION_NAMES } from '@wcpos/sync-engine';

import { useCollectionCounts, useMutationCounts } from './use-engine-monitor';

type FakeDatabase = { collections: Record<string, unknown> };

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

function mutationDatabase(
	pending: number,
	conflicts: number,
	rejected = 0,
	unresolvedConflicts = conflicts - rejected
) {
	const pending$ = new BehaviorSubject(Array.from({ length: pending }, () => ({})));
	const conflicts$ = new BehaviorSubject(Array.from({ length: conflicts }, () => ({})));
	const rejected$ = new BehaviorSubject(Array.from({ length: rejected }, () => ({})));
	const unresolvedConflicts$ = new BehaviorSubject(
		Array.from({ length: unresolvedConflicts }, () => ({}))
	);
	const find = jest.fn(
		(query: { selector: { status: { $in: string[] }; collectionName?: { $eq: string } } }) => {
			const statuses = query.selector.status.$in;
			// The dead-letter-only query (#832) is the single-status one; the lumped
			// terminal query also mentions 'rejected' but names two more statuses.
			if (statuses.length === 1 && statuses[0] === 'rejected') return { $: rejected$ };
			if (statuses.includes('rejected')) return { $: conflicts$ };
			if (statuses.length === 2 && statuses.includes('conflicted'))
				return { $: unresolvedConflicts$ };
			return { $: pending$ };
		}
	);
	return {
		pending$,
		rejected$,
		unresolvedConflicts$,
		find,
		database: {
			collections: { [MUTATION_QUEUE_RXDB_COLLECTION]: { find } },
		},
	};
}

describe('engine monitor hooks', () => {
	afterEach(() => mockDatabase$.next(null));

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
		const mutations = mutationDatabase(3, 0);
		mockDatabase$.next(mutations.database);
		const { result, unmount } = renderHook(() => useMutationCounts());

		expect(mutations.find).toHaveBeenCalledWith({
			selector: {
				status: { $in: ['pending', 'claimed', 'conflicted', 'needs-revision'] },
			},
		});
		for (const call of mutations.find.mock.calls) {
			expect(call[0].selector.collectionName).toBeUndefined();
		}
		expect(result.current).toEqual({
			pending: 3,
			conflicts: 0,
			rejected: 0,
			unresolvedConflicts: 0,
		});
		act(() => mutations.pending$.next([{}]));
		expect(result.current).toEqual({
			pending: 1,
			conflicts: 0,
			rejected: 0,
			unresolvedConflicts: 0,
		});

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
			pending: 0,
			conflicts: 3,
			rejected: 2,
			unresolvedConflicts: 1,
		});
		act(() => mutations.rejected$.next([]));
		expect(result.current).toEqual({
			pending: 0,
			conflicts: 3,
			rejected: 0,
			unresolvedConflicts: 1,
		});

		unmount();
	});

	it('re-runs mutation queries after a same-database reset', () => {
		const first = mutationDatabase(3, 0);
		const reset = mutationDatabase(5, 1);
		mockDatabase$.next(first.database);
		const { result, unmount } = renderHook(() => useMutationCounts());

		expect(result.current).toMatchObject({
			pending: 3,
			conflicts: 0,
			rejected: 0,
		});
		act(() => {
			first.database.collections = reset.database.collections;
			mockDatabase$.next(first.database);
		});
		expect(result.current).toMatchObject({
			pending: 5,
			conflicts: 1,
			rejected: 0,
		});
		act(() => first.pending$.next([]));
		expect(result.current).toMatchObject({
			pending: 5,
			conflicts: 1,
			rejected: 0,
		});

		unmount();
	});
});
