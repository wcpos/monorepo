/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';
import type { PaymentRow } from '@wcpos/order-math';

import {
	clearOrderSaving,
	enterCheckout,
	enterReceipt,
	finishReceipt,
	getCheckoutModeSnapshot,
	leaveCheckout,
	markOrderSaving,
	resetCheckoutMode,
	resolveStage,
	seedCheckoutFromUrl,
	selectReceipt,
	setTenderMethod,
	subscribeCheckoutMode,
	takeMethodSeed,
	useOrderCheckoutStage,
	useOrderSaving,
} from './checkout-mode';

let mockDraft = false;
const mockRecord = { uuid: 'a', payload: { meta_data: [] } };
jest.mock('@wcpos/query', () => ({
	useRecordField: <T>(record: T, select: (value: T) => unknown) =>
		record ? select(record) : undefined,
}));

beforeEach(resetCheckoutMode);

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
	expect(before.savingOrders.size).toBe(0);
	enterCheckout('a');
	leaveCheckout('a');
	expect(getCheckoutModeSnapshot().savingOrders.has('a')).toBe(true);
	clearOrderSaving('a');
	const cleared = getCheckoutModeSnapshot();
	clearOrderSaving('a');
	expect(getCheckoutModeSnapshot()).toBe(cleared);
	expect(cleared.savingOrders.size).toBe(0);
	expect(saving.savingOrders.has('a')).toBe(true);
	markOrderSaving('b');
	resetCheckoutMode();
	expect(getCheckoutModeSnapshot().savingOrders.size).toBe(0);
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
it('seeds checkout and consumes the method once; reset drops pending seeds', () => {
	seedCheckoutFromUrl('a', 'cash');
	expect(getCheckoutModeSnapshot().checkoutOrders.has('a')).toBe(true);
	expect(takeMethodSeed('a')).toBe('cash');
	expect(takeMethodSeed('a')).toBeUndefined();
	seedCheckoutFromUrl('b', 'card');
	resetCheckoutMode();
	expect(takeMethodSeed('b')).toBeUndefined();
});
