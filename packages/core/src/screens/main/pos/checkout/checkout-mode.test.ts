/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';
import type { PaymentRow } from '@wcpos/order-math';

import {
	clearOrderSaveIfMutation,
	clearOrderSaving,
	enterCheckout,
	enterReceipt,
	finishReceipt,
	getCheckoutModeSnapshot,
	getOrderSaveState,
	leaveCheckout,
	markOrderQueuedOffline,
	markOrderSaveRejected,
	markOrderSaving,
	resetCheckoutMode,
	resolveStage,
	selectReceipt,
	setTenderMethod,
	subscribeCheckoutMode,
	useOrderCheckoutStage,
	useOrderSaveState,
	useOrderSaving,
} from './checkout-mode';

let mockDraft = false;
const mockRecord = { uuid: 'a', payload: { meta_data: [] } };
jest.mock('@wcpos/query', () => ({
	useRecordField: <T>(record: T, select: (value: T) => unknown) =>
		record ? select(record) : undefined,
}));

let mockStatus = 'online-website-available';
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
beforeEach(() => {
	resetCheckoutMode();
	mockStatus = 'online-website-available';
});

it('defaults to cart and ignores ended legs', () => {
	expect(resolveStage('a', getCheckoutModeSnapshot(), [])).toBe('cart');
	expect(
		resolveStage('a', getCheckoutModeSnapshot(), [
			{ status: 'voided' },
			{ status: 'failed' },
		] as PaymentRow[])
	).toBe('cart');
	expect(resolveStage(undefined, getCheckoutModeSnapshot(), [])).toBe('cart');
});
it('resolves explicit checkout independently for each order', () => {
	enterCheckout('a');
	enterCheckout('b');
	leaveCheckout('a');
	expect(resolveStage('a', getCheckoutModeSnapshot(), [])).toBe('cart');
	expect(resolveStage('b', getCheckoutModeSnapshot(), [])).toBe('checkout');
});
it.each(['pending', 'authorized', 'captured'])(
	'recovers checkout from a %s ledger row',
	(status) => {
		expect(resolveStage('a', getCheckoutModeSnapshot(), [{ status }] as PaymentRow[])).toBe(
			'checkout'
		);
	}
);
it('receipt wins over checkout and live rows, and can be selected and finished', () => {
	enterCheckout('a');
	enterReceipt('a');
	expect(getCheckoutModeSnapshot().checkoutOrders.has('a')).toBe(false);
	expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBe('a');
	expect(
		resolveStage('a', getCheckoutModeSnapshot(), [{ status: 'captured' }] as PaymentRow[])
	).toBe('receipt');
	selectReceipt(null);
	expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
	selectReceipt('a');
	finishReceipt('a');
	expect(getCheckoutModeSnapshot().receiptOrders.size).toBe(0);
	expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
});
it('publishes immutable snapshots, skips duplicate entry, and unsubscribes', () => {
	const listener = jest.fn();
	const unsubscribe = subscribeCheckoutMode(listener);
	const before = getCheckoutModeSnapshot();
	enterCheckout('a');
	enterCheckout('a');
	expect(before.checkoutOrders.size).toBe(0);
	expect(listener).toHaveBeenCalledTimes(1);
	unsubscribe();
	leaveCheckout('a');
	expect(listener).toHaveBeenCalledTimes(1);
});

it('subscribes the current order stage; a draft flagged by Pay swaps too, its ledger ignored', () => {
	mockDraft = false;
	const { result, rerender } = renderHook(() =>
		useOrderCheckoutStage({ ...mockRecord, isNew: mockDraft } as unknown as EngineRecord<'orders'>)
	);
	expect(result.current).toBe('cart');
	act(() => enterCheckout('a'));
	expect(result.current).toBe('checkout');
	mockDraft = true;
	rerender();
	expect(result.current).toBe('checkout');
	act(() => leaveCheckout('a'));
	expect(result.current).toBe('cart');
});

it('accepts an absent record', () => {
	const { result } = renderHook(() => useOrderCheckoutStage(undefined));
	expect(result.current).toBe('cart');
});

it('publishes saving changes idempotently, preserves saving on leave, and resets it', () => {
	const before = getCheckoutModeSnapshot();
	markOrderSaving('a');
	const saving = getCheckoutModeSnapshot();
	markOrderSaving('a');
	expect(getCheckoutModeSnapshot()).toBe(saving);
	expect(before.saveStates.size).toBe(0);
	enterCheckout('a');
	leaveCheckout('a');
	expect(getCheckoutModeSnapshot().saveStates.has('a')).toBe(true);
	clearOrderSaving('a');
	const cleared = getCheckoutModeSnapshot();
	clearOrderSaving('a');
	expect(getCheckoutModeSnapshot()).toBe(cleared);
	expect(cleared.saveStates.size).toBe(0);
	expect(saving.saveStates.has('a')).toBe(true);
	markOrderSaving('b');
	resetCheckoutMode();
	expect(getCheckoutModeSnapshot().saveStates.size).toBe(0);
});
it('subscribes to saving for only the requested order', () => {
	const { result } = renderHook(() => [useOrderSaving('a'), useOrderSaving(undefined)]);
	expect(result.current).toEqual([false, false]);
	act(() => markOrderSaving('a'));
	expect(result.current).toEqual([true, false]);
	act(() => clearOrderSaving('a'));
	expect(result.current).toEqual([false, false]);
});

it('publishes tender methods only on change, keeping old snapshots immutable', () => {
	const listener = jest.fn();
	const unsubscribe = subscribeCheckoutMode(listener);
	const before = getCheckoutModeSnapshot();
	setTenderMethod('a', null);
	setTenderMethod('a', 'cash');
	const picked = getCheckoutModeSnapshot();
	setTenderMethod('a', 'cash');
	expect(listener).toHaveBeenCalledTimes(1);
	expect(before.tenderMethods.size).toBe(0);
	expect(picked.tenderMethods.get('a')).toBe('cash');
	setTenderMethod('a', 'card');
	setTenderMethod('a', null);
	setTenderMethod('a', null);
	expect(listener).toHaveBeenCalledTimes(3);
	expect(getCheckoutModeSnapshot().tenderMethods.size).toBe(0);
	expect(picked.tenderMethods.get('a')).toBe('cash');
	unsubscribe();
});
it.each([leaveCheckout, enterReceipt, finishReceipt, resetCheckoutMode])(
	'clears the tender method on %p',
	(exit) => {
		enterCheckout('a');
		setTenderMethod('a', 'cash');
		exit('a');
		expect(getCheckoutModeSnapshot().tenderMethods.has('a')).toBe(false);
	}
);

it('queues only an active save and ignores a different mutation', () => {
	markOrderQueuedOffline('a', 'm');
	expect(getOrderSaveState('a')).toBeNull();
	markOrderSaving('a');
	markOrderQueuedOffline('a', 'm');
	const queued = getCheckoutModeSnapshot();
	markOrderQueuedOffline('a', 'm');
	markOrderQueuedOffline('a', 'other');
	expect(getCheckoutModeSnapshot()).toBe(queued);
	expect(getOrderSaveState('a')).toEqual({ kind: 'queued-offline', mutationId: 'm' });
	clearOrderSaveIfMutation('a', 'other');
	expect(getCheckoutModeSnapshot()).toBe(queued);
	clearOrderSaveIfMutation('a', 'm');
	expect(getOrderSaveState('a')).toBeNull();
});
it('a new save replaces queued state and survives a stale acknowledgement', () => {
	markOrderSaving('a');
	markOrderQueuedOffline('a', 'm');
	markOrderSaving('a');
	clearOrderSaveIfMutation('a', 'm');
	expect(getOrderSaveState('a')).toEqual({ kind: 'saving' });
});
it('rejection is final, idempotent by fields, and can be cleared', () => {
	const rejection = { status: 403, reason: 'refused', message: 'No permission' };
	markOrderSaveRejected('a', rejection);
	const held = getCheckoutModeSnapshot();
	markOrderSaveRejected('a', { ...rejection });
	markOrderSaving('a');
	markOrderQueuedOffline('a', 'm');
	clearOrderSaveIfMutation('a', 'm');
	expect(getCheckoutModeSnapshot()).toBe(held);
	markOrderSaveRejected('a', { ...rejection, message: 'Changed' });
	expect(getOrderSaveState('a')).toEqual({ kind: 'rejected', ...rejection, message: 'Changed' });
	clearOrderSaving('a');
	expect(getOrderSaveState('a')).toBeNull();
});
it('derives offline immediately without changing the stored saving state', () => {
	markOrderSaving('a');
	const { result, rerender } = renderHook(() => [useOrderSaveState('a'), useOrderSaving('a')]);
	mockStatus = 'online-website-unavailable';
	rerender();
	expect(result.current).toEqual([{ kind: 'saving' }, true]);
	mockStatus = 'offline';
	rerender();
	expect(result.current).toEqual([{ kind: 'queued-offline', mutationId: '' }, false]);
	expect(getOrderSaveState('a')).toEqual({ kind: 'saving' });
});
