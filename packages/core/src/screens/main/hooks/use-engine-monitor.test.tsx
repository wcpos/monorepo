/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useCollectionCounts, useEngineStatus, useMutationCounts } from './use-engine-monitor';

const initialStatus = { connectivity: 'online' };
const engine = { status: jest.fn(() => initialStatus), statusChanges: jest.fn() };
const mockStatusSubscribers = new Set<(status: typeof initialStatus) => void>();
const mockCollectionSubscribers = new Set<(counts: Record<string, number>) => void>();
const mockMutationSubscribers = new Set<(counts: { pending: number; conflicts: number }) => void>();
const mockStatusUnsubscribe = jest.fn();
const mockCollectionUnsubscribe = jest.fn();
const mockMutationUnsubscribe = jest.fn();

engine.statusChanges.mockImplementation((cb) => {
	mockStatusSubscribers.add(cb);
	cb(initialStatus);
	return () => {
		mockStatusSubscribers.delete(cb);
		mockStatusUnsubscribe();
	};
});

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({ engine }),
	observeEngineCollectionCounts: (
		_engine: unknown,
		cb: (counts: Record<string, number>) => void
	) => {
		mockCollectionSubscribers.add(cb);
		cb({ orders: 1 });
		return () => {
			mockCollectionSubscribers.delete(cb);
			mockCollectionUnsubscribe();
		};
	},
	observeEngineMutationCounts: (
		_engine: unknown,
		cb: (counts: { pending: number; conflicts: number }) => void
	) => {
		mockMutationSubscribers.add(cb);
		cb({ pending: 2, conflicts: 3 });
		return () => {
			mockMutationSubscribers.delete(cb);
			mockMutationUnsubscribe();
		};
	},
}));

describe('engine monitor hooks', () => {
	beforeEach(() => {
		mockStatusUnsubscribe.mockClear();
		mockCollectionUnsubscribe.mockClear();
		mockMutationUnsubscribe.mockClear();
	});

	it('subscribes to engine monitor surfaces and releases them on unmount', () => {
		const { result, unmount } = renderHook(() => ({
			status: useEngineStatus(),
			collections: useCollectionCounts(),
			mutations: useMutationCounts(),
		}));

		expect(result.current).toEqual({
			status: initialStatus,
			collections: { orders: 1 },
			mutations: { pending: 2, conflicts: 3 },
		});

		act(() => {
			for (const subscriber of mockStatusSubscribers) {
				subscriber({ connectivity: 'offline' });
			}
			for (const subscriber of mockCollectionSubscribers) subscriber({ orders: 4 });
			for (const subscriber of mockMutationSubscribers) {
				subscriber({ pending: 5, conflicts: 6 });
			}
		});

		expect(result.current).toEqual({
			status: { connectivity: 'offline' },
			collections: { orders: 4 },
			mutations: { pending: 5, conflicts: 6 },
		});

		unmount();
		expect(mockStatusUnsubscribe).toHaveBeenCalledTimes(1);
		expect(mockCollectionUnsubscribe).toHaveBeenCalledTimes(1);
		expect(mockMutationUnsubscribe).toHaveBeenCalledTimes(1);
	});
});
