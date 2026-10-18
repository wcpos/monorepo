/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { TERMINAL_QUEUE_STATUSES } from '@wcpos/query';

import { getOrderSaveState, markOrderSaveRejected, resetCheckoutMode } from './checkout-mode';
import { useRejectedOrderSavesSync } from './use-rejected-order-saves';

const mockRows = new BehaviorSubject<unknown[]>([]);
const mockObserveQueueRows = jest.fn((_engine?: unknown, _selection?: unknown) =>
	mockRows.asObservable()
);
const mockEngine = {};
jest.mock('@wcpos/query', () => ({
	TERMINAL_QUEUE_STATUSES: ['conflicted', 'needs-revision', 'rejected'],
	observeQueueRows: (engine: unknown, selection: unknown) =>
		mockObserveQueueRows(engine, selection),
	useQueryRuntime: () => ({ engine: mockEngine }),
}));
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
	const { unmount } = renderHook(() => useRejectedOrderSavesSync(1));
	expect(mockObserveQueueRows).toHaveBeenCalledWith(mockEngine, {
		statuses: TERMINAL_QUEUE_STATUSES,
		collectionName: 'orders',
	});
	expect(getOrderSaveState('unseen')).toEqual({ kind: 'rejected', ...rejection });
	act(() =>
		mockRows.next([
			{
				recordId: 'a',
				rejectedStatus: 403,
				rejectedReason: 'refused',
				rejectedMessage: 'No permission',
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
	expect(mockRows.observed).toBe(false);
});

it('re-reads the durable rows when the store id changes after a checkout reset', () => {
	mockRows.next([{ recordId: 'a', rejectedStatus: 400, rejectedReason: 'refused' }]);
	const { rerender } = renderHook(({ storeId }) => useRejectedOrderSavesSync(storeId), {
		initialProps: { storeId: 1 as number | string | undefined },
	});
	expect(getOrderSaveState('a')?.kind).toBe('rejected');
	// The store-change reset wipes the hold; the same engine (no re-subscribe on it alone)
	// must still restore the dead letter's hold for the new store id.
	act(() => resetCheckoutMode());
	expect(getOrderSaveState('a')).toBeNull();
	rerender({ storeId: 2 });
	expect(mockObserveQueueRows).toHaveBeenCalledTimes(2);
	expect(getOrderSaveState('a')?.kind).toBe('rejected');
});
