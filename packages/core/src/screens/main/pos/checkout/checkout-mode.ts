import * as React from 'react';

import isEqual from 'lodash/isEqual';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { type PaymentRow, readLedger } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import type { CurrentOrderRecord } from '../contexts/current-order/context';

export type OrderSaveState =
	| { kind: 'saving' }
	| { kind: 'queued-offline'; mutationId: string }
	| { kind: 'rejected'; status: number | null; reason: string | null; message: string | null };

export interface CheckoutModeSnapshot {
	readonly tenderMethods: ReadonlyMap<string, string>;
	readonly saveStates: ReadonlyMap<string, OrderSaveState>;
	readonly checkoutOrders: ReadonlySet<string>;
	readonly receiptOrders: ReadonlySet<string>;
	readonly selectedReceiptOrder: string | null;
}

let snapshot: CheckoutModeSnapshot = {
	tenderMethods: new Map(),
	saveStates: new Map(),
	checkoutOrders: new Set(),
	receiptOrders: new Set(),
	selectedReceiptOrder: null,
};
// Receipt panes remount when cashiers switch tabs; an auto-print attempt belongs
// to the sale, not the mount. Keep this transient and clear it when the sale ends.
const receiptPrintAttempts = new Set<string>();
export function claimReceiptAutoPrint(uuid: string) {
	if (receiptPrintAttempts.has(uuid)) return false;
	receiptPrintAttempts.add(uuid);
	return true;
}

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
export function getOrderSaveState(uuid: string): OrderSaveState | null {
	return snapshot.saveStates.get(uuid) ?? null;
}
function setOrderSaveState(uuid: string, state: OrderSaveState) {
	const current = getOrderSaveState(uuid);
	if (isEqual(current, state)) return;
	publish({ ...snapshot, saveStates: new Map(snapshot.saveStates).set(uuid, state) });
}
export function markOrderSaving(uuid: string) {
	if (getOrderSaveState(uuid)?.kind === 'rejected') return;
	setOrderSaveState(uuid, { kind: 'saving' });
}
export function markOrderQueuedOffline(uuid: string, mutationId: string) {
	const current = getOrderSaveState(uuid);
	if (
		current?.kind === 'saving' ||
		(current?.kind === 'queued-offline' && current.mutationId === mutationId)
	)
		setOrderSaveState(uuid, { kind: 'queued-offline', mutationId });
}
export function markOrderSaveRejected(
	uuid: string,
	rejection: Omit<Extract<OrderSaveState, { kind: 'rejected' }>, 'kind'>
) {
	setOrderSaveState(uuid, { kind: 'rejected', ...rejection });
}
export function clearOrderSaving(uuid: string) {
	if (!snapshot.saveStates.has(uuid)) return;
	const saveStates = new Map(snapshot.saveStates);
	saveStates.delete(uuid);
	publish({ ...snapshot, saveStates });
}
export function clearOrderSaveIfMutation(uuid: string, mutationId: string) {
	const current = getOrderSaveState(uuid);
	if (current?.kind === 'queued-offline' && current.mutationId === mutationId)
		clearOrderSaving(uuid);
}
export function enterCheckout(uuid: string) {
	if (snapshot.checkoutOrders.has(uuid)) return;
	publish({ ...snapshot, checkoutOrders: new Set([...snapshot.checkoutOrders, uuid]) });
}
export function setTenderMethod(uuid: string, methodId: string | null) {
	if ((snapshot.tenderMethods.get(uuid) ?? null) === methodId) return;
	const tenderMethods = new Map(snapshot.tenderMethods);
	if (methodId === null) tenderMethods.delete(uuid);
	else tenderMethods.set(uuid, methodId);
	publish({ ...snapshot, tenderMethods });
}
export function useTenderMethod(uuid: string) {
	return useCheckoutMode().tenderMethods.get(uuid) ?? null;
}
export function leaveCheckout(uuid: string) {
	setTenderMethod(uuid, null);
	if (!snapshot.checkoutOrders.has(uuid)) return;
	const checkoutOrders = new Set(snapshot.checkoutOrders);
	checkoutOrders.delete(uuid);
	publish({ ...snapshot, checkoutOrders });
}
/**
 * Move an order to its receipt stage. Selecting it brings the receipt on screen,
 * which is right when the cashier just took the final payment here — and wrong
 * when a terminal leg completes in the background for an order they are not
 * serving: that order keeps its tab ("Paid · receipt") and waits to be tapped.
 */
export function enterReceipt(uuid: string, { select = true }: { select?: boolean } = {}) {
	setTenderMethod(uuid, null);
	const checkoutOrders = new Set(snapshot.checkoutOrders);
	checkoutOrders.delete(uuid);
	publish({
		...snapshot,
		checkoutOrders,
		receiptOrders: new Set([...snapshot.receiptOrders, uuid]),
		selectedReceiptOrder: select ? uuid : snapshot.selectedReceiptOrder,
	});
}
export function finishReceipt(uuid: string) {
	setTenderMethod(uuid, null);
	receiptPrintAttempts.delete(uuid);
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
	receiptPrintAttempts.clear();
	publish({
		tenderMethods: new Map(),
		saveStates: new Map(),
		checkoutOrders: new Set(),
		receiptOrders: new Set(),
		selectedReceiptOrder: null,
	});
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
/**
 * The store is module-global and survives a store switch; a receipt or checkout selection
 * from the previous store would then be resolved against the new store's records. Reset on a
 * CHANGE of store id only — never on mount, or leaving the POS for the Orders screen and
 * coming back would drop every order that was mid-checkout.
 */
export function useResetCheckoutModeOnStoreChange(storeId: number | string | undefined) {
	const previous = React.useRef(storeId);
	// The store id is external session state; reacting to its change is the effect's purpose.
	React.useEffect(() => {
		if (previous.current !== storeId) {
			previous.current = storeId;
			resetCheckoutMode();
		}
	}, [storeId]);
}

export function useCheckoutMode() {
	return React.useSyncExternalStore(
		subscribeCheckoutMode,
		getCheckoutModeSnapshot,
		getCheckoutModeSnapshot
	);
}
/**
 * The store entry, with one derivation: a save still `saving` while the till is offline reads as
 * `queued-offline`. The engine's connectivity port is pull-only and its status only notices a flip
 * on the next automatic tick, so without this the pane would keep its skeletons for up to a tick
 * after the network dropped. Only `'offline'` flips it; `'online-website-unavailable'` stays
 * `saving` because that is exactly the "store is not answering" case. The pending settlement is
 * untouched and still resolves on engine events (roadmap#171).
 */
export function useOrderSaveState(uuid: string | undefined): OrderSaveState | null {
	const mode = useCheckoutMode();
	const { status } = useOnlineStatus();
	const state = uuid === undefined ? null : (mode.saveStates.get(uuid) ?? null);
	return state?.kind === 'saving' && status === 'offline'
		? { kind: 'queued-offline', mutationId: '' }
		: state;
}
export function useOrderSaving(uuid: string | undefined): boolean {
	return useOrderSaveState(uuid)?.kind === 'saving';
}
export function useOrderCheckoutStage(
	record: CurrentOrderRecord | EngineRecord<'orders'> | undefined
) {
	const mode = useCheckoutMode();
	const meta = useRecordField(record, (order) => order.payload.meta_data);
	// A draft has no ledger to derive from, but Pay can flag it before its first
	// save lands; the explicit store entry must swap the columns for it too.
	const isNew = Boolean((record as { isNew?: boolean } | undefined)?.isNew);
	return resolveStage(record?.uuid, mode, isNew ? [] : readLedger(meta));
}
