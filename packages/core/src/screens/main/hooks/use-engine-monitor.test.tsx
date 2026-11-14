/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import type { EngineMutationCounts } from '@wcpos/query';

import { useCollectionCounts, useMutationCounts } from './use-engine-monitor';

const mockEngine = {};
const mockCollections = new BehaviorSubject({ orders: 0 });
const mockCounts = new BehaviorSubject<EngineMutationCounts>({
	syncBacklog: 0,
	syncBacklogSales: 0,
	needsDecision: 0,
	needsDecisionRejected: 0,
	needsDecisionUnresolved: 0,
});
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: mockEngine }),
	emptyCollectionCounts: () => ({ orders: 0 }),
	observeCollectionCounts: () => mockCollections.asObservable(),
	observeQueueCounts: () => mockCounts.asObservable(),
}));

it('adapts named live counts and unsubscribes on unmount', () => {
	const collections = renderHook(() => useCollectionCounts());
	const mutations = renderHook(() => useMutationCounts());
	act(() => {
		mockCollections.next({ orders: 7 });
		mockCounts.next({
			syncBacklog: 3,
			syncBacklogSales: 2,
			needsDecision: 3,
			needsDecisionRejected: 1,
			needsDecisionUnresolved: 2,
		});
	});
	expect(collections.result.current).toEqual({ orders: 7 });
	expect(mutations.result.current).toEqual(mockCounts.value);
	collections.unmount();
	mutations.unmount();
	expect(mockCollections.observed).toBe(false);
	expect(mockCounts.observed).toBe(false);
});
