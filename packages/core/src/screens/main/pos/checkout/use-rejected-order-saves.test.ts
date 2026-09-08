/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { MUTATION_QUEUE_RXDB_COLLECTION } from '@wcpos/sync-engine';

import { getOrderSaveState, markOrderSaveRejected, resetCheckoutMode } from './checkout-mode';
import { useRejectedOrderSavesSync } from './use-rejected-order-saves';

const mockRows = new BehaviorSubject<unknown[]>([]);
const mockFind = jest.fn(() => ({ $: mockRows }));
const mockDbUnsubscribe = jest.fn();
const mockEngine = {
	db$: (callback: (database: unknown) => void) => {
		callback({ collections: { [MUTATION_QUEUE_RXDB_COLLECTION]: { find: mockFind } } });
		return mockDbUnsubscribe;
	},
};
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({ engine: mockEngine }) }));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
beforeEach(() => {
	resetCheckoutMode();
	mockRows.next([]);
	jest.clearAllMocks();
});
it('holds durable rows, clears disappeared rows, and leaves unseen rejections alone', () => {
	const rejection = { status: 403, reason: 'refused', message: 'No permission' };
	markOrderSaveRejected('unseen', rejection);
	const { unmount } = renderHook(useRejectedOrderSavesSync);
	expect(mockFind).toHaveBeenCalledWith({
		selector: {
			status: { $in: ['rejected', 'conflicted', 'needs-revision'] },
			collectionName: { $eq: 'orders' },
		},
	});
	expect(getOrderSaveState('unseen')).toEqual({ kind: 'rejected', ...rejection });
	act(() =>
		mockRows.next([
			{
				toJSON: () => ({
					recordId: 'a',
					rejectedStatus: 403,
					rejectedReason: 'refused',
					rejectedMessage: 'No permission',
				}),
			},
			{ recordId: 'b' },
		])
	);
	expect(getOrderSaveState('a')).toEqual({ kind: 'rejected', ...rejection });
	expect(getOrderSaveState('b')).toEqual({
		kind: 'rejected',
		status: null,
		reason: null,
		message: null,
	});
	act(() => mockRows.next([]));
	expect(getOrderSaveState('a')).toBeNull();
	expect(getOrderSaveState('b')).toBeNull();
	expect(getOrderSaveState('unseen')).toEqual({ kind: 'rejected', ...rejection });
	unmount();
	expect(mockDbUnsubscribe).toHaveBeenCalledTimes(1);
	expect(mockRows.observed).toBe(false);
});
