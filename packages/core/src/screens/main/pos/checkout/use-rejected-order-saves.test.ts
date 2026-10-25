/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { TERMINAL_QUEUE_STATUSES } from '@wcpos/query';

import {
	getOrderSaveState,
	markOrderSaveRejected,
	markOrderSaving,
	resetCheckoutMode,
} from './checkout-mode';
import { useRejectedOrderSavesSync } from './use-rejected-order-saves';

const mockRows = new BehaviorSubject<unknown[]>([]);
const mockObserveQueueRows = jest.fn((_engine?: unknown, _selection?: unknown) =>
	mockRows.asObservable()
);
const mockEngine = {};
jest.mock('@wcpos/query', () => ({
	TERMINAL_QUEUE_STATUSES: ['conflicted', 'needs-revision', 'rejected'],
	PARKED_QUEUE_STATUSES: ['conflicted', 'needs-revision'],
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
	expect(getOrderSaveState('unseen')).toEqual({
		kind: 'rejected',
		...rejection,
		refused: null,
		parked: false,
	});
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
	expect(getOrderSaveState('a')).toEqual({
		kind: 'rejected',
		...rejection,
		refused: {},
		parked: false,
	});
	expect(getOrderSaveState('b')).toEqual({
		kind: 'rejected',
		status: null,
		reason: null,
		message: null,
		refused: {},
		parked: false,
	});
	act(() => mockRows.next([]));
	expect(getOrderSaveState('a')).toBeNull();
	expect(getOrderSaveState('b')).toBeNull();
	expect(getOrderSaveState('unseen')).toEqual({
		kind: 'rejected',
		...rejection,
		refused: null,
		parked: false,
	});
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

const line = { product_id: 1, quantity: 2, subtotal: '20.00', total: '20.00' };
const deadLetter = (mutationId: string, quantity: number, queuedAt: string) => ({
	mutationId,
	recordId: 'a',
	queuedAt,
	rejectedStatus: 400,
	rejectedReason: 'rest_invalid_param',
	payload: {
		line_items: [{ ...line, quantity }],
		total: '20.00',
		meta_data: [{ key: '_pos_user', value: '1' }],
	},
});

it("carries the newest dead letter's wire projection as the refused payload", () => {
	mockRows.next([
		deadLetter('m2', 3, '2026-10-25T10:00:02.000Z'),
		deadLetter('m1', 2, '2026-10-25T10:00:01.000Z'),
	]);
	renderHook(() => useRejectedOrderSavesSync(1));
	expect(getOrderSaveState('a')).toEqual({
		kind: 'rejected',
		status: 400,
		reason: 'rest_invalid_param',
		message: null,
		refused: { line_items: [{ ...line, quantity: 3 }] },
		parked: false,
	});
});

it('leaves a retry in flight on its wait, even when its dead letter goes', () => {
	const row = deadLetter('m1', 2, '2026-10-25T10:00:01.000Z');
	mockRows.next([row]);
	renderHook(() => useRejectedOrderSavesSync(1));
	expect(getOrderSaveState('a')?.kind).toBe('rejected');
	markOrderSaving('a', { retry: true });
	act(() => mockRows.next([row]));
	expect(getOrderSaveState('a')).toEqual({ kind: 'saving' });
	act(() => mockRows.next([]));
	expect(getOrderSaveState('a')).toEqual({ kind: 'saving' });
});

it('marks a conflicted row as parked, so Pay never retries over it', () => {
	mockRows.next([{ ...deadLetter('m1', 2, '2026-10-25T10:00:01.000Z'), status: 'conflicted' }]);
	renderHook(() => useRejectedOrderSavesSync(1));
	expect(getOrderSaveState('a')).toEqual(
		expect.objectContaining({ kind: 'rejected', parked: true })
	);
});

it('marks a retry that the store refuses again', () => {
	const first = deadLetter('m1', 2, '2026-10-25T10:00:01.000Z');
	mockRows.next([first]);
	renderHook(() => useRejectedOrderSavesSync(1));
	markOrderSaving('a', { retry: true });
	act(() => mockRows.next([first, deadLetter('m2', 3, '2026-10-25T10:00:02.000Z')]));
	expect(getOrderSaveState('a')).toEqual(
		expect.objectContaining({
			kind: 'rejected',
			refused: { line_items: [{ ...line, quantity: 3 }] },
		})
	);
});
