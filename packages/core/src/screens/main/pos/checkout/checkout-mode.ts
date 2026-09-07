import * as React from 'react';

import { type PaymentRow, readLedger } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import type { CurrentOrderRecord } from '../contexts/current-order/context';

export interface CheckoutModeSnapshot {
	readonly checkoutOrders: ReadonlySet<string>;
	readonly receiptOrders: ReadonlySet<string>;
	readonly selectedReceiptOrder: string | null;
}

let snapshot: CheckoutModeSnapshot = {
	checkoutOrders: new Set(),
	receiptOrders: new Set(),
	selectedReceiptOrder: null,
};
const listeners = new Set<() => void>();
const publish = (next: CheckoutModeSnapshot) => {
	snapshot = next;
	listeners.forEach((listener) => listener());
};
export const getCheckoutModeSnapshot = () => snapshot;
export function subscribeCheckoutMode(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
export function enterCheckout(uuid: string) {
	if (snapshot.checkoutOrders.has(uuid)) return;
	publish({ ...snapshot, checkoutOrders: new Set([...snapshot.checkoutOrders, uuid]) });
}
export function leaveCheckout(uuid: string) {
	if (!snapshot.checkoutOrders.has(uuid)) return;
	const checkoutOrders = new Set(snapshot.checkoutOrders);
	checkoutOrders.delete(uuid);
	publish({ ...snapshot, checkoutOrders });
}
export function enterReceipt(uuid: string) {
	const checkoutOrders = new Set(snapshot.checkoutOrders);
	checkoutOrders.delete(uuid);
	publish({
		checkoutOrders,
		receiptOrders: new Set([...snapshot.receiptOrders, uuid]),
		selectedReceiptOrder: uuid,
	});
}
export function finishReceipt(uuid: string) {
	const receiptOrders = new Set(snapshot.receiptOrders);
	receiptOrders.delete(uuid);
	publish({
		...snapshot,
		receiptOrders,
		selectedReceiptOrder:
			snapshot.selectedReceiptOrder === uuid ? null : snapshot.selectedReceiptOrder,
	});
}
export function selectReceipt(uuid: string | null) {
	if (snapshot.selectedReceiptOrder === uuid) return;
	publish({ ...snapshot, selectedReceiptOrder: uuid });
}
export function resetCheckoutMode() {
	publish({ checkoutOrders: new Set(), receiptOrders: new Set(), selectedReceiptOrder: null });
}

export function resolveStage(
	uuid: string | undefined,
	mode: CheckoutModeSnapshot,
	rows: PaymentRow[]
): 'cart' | 'checkout' | 'receipt' {
	if (!uuid) return 'cart';
	if (mode.receiptOrders.has(uuid)) return 'receipt';
	if (
		mode.checkoutOrders.has(uuid) ||
		rows.some(
			(row) => row.status === 'pending' || row.status === 'authorized' || row.status === 'captured'
		)
	)
		return 'checkout';
	return 'cart';
}
export function useCheckoutMode() {
	return React.useSyncExternalStore(
		subscribeCheckoutMode,
		getCheckoutModeSnapshot,
		getCheckoutModeSnapshot
	);
}
export function useOrderCheckoutStage(
	record: CurrentOrderRecord | EngineRecord<'orders'> | undefined
) {
	const mode = useCheckoutMode();
	const meta = useRecordField(record, (order) => order.payload.meta_data);
	return resolveStage(
		(record as { isNew?: boolean } | undefined)?.isNew ? undefined : record?.uuid,
		mode,
		readLedger(meta)
	);
}
