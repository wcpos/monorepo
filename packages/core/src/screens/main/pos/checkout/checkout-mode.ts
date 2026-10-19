import * as React from 'react';

import isEqual from 'lodash/isEqual';

import { isLivePaymentStatus, type PaymentRow, readLedger } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { TenderLineId, TenderPlan } from './tender/tender-state';

export type OrderSaveState =
	| { kind: 'saving' }
	| { kind: 'queued-offline'; mutationId: string }
	| { kind: 'rejected'; status: number | null; reason: string | null; message: string | null };

export interface CheckoutModeSnapshot {
	readonly linesPaidBy: ReadonlyMap<string, Record<TenderLineId, string[]>>;
	readonly tenderPlans: ReadonlyMap<string, TenderPlan>;
	readonly tenderMethods: ReadonlyMap<string, string>;
	readonly saveStates: ReadonlyMap<string, OrderSaveState>;
	readonly checkoutOrders: ReadonlySet<string>;
	readonly receiptOrders: ReadonlySet<string>;
	readonly selectedReceiptOrder: string | null;
}

let snapshot: CheckoutModeSnapshot = {
	tenderMethods: new Map(),
	tenderPlans: new Map(),
	linesPaidBy: new Map(),
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
export function setTenderPlan(uuid: string, plan: TenderPlan | null) {
	if (isEqual(snapshot.tenderPlans.get(uuid) ?? null, plan)) return;
	const tenderPlans = new Map(snapshot.tenderPlans);
	if (plan === null) tenderPlans.delete(uuid);
	else tenderPlans.set(uuid, plan);
	publish({ ...snapshot, tenderPlans });
}
/** Client-only split badges shared with the separately mounted checkout ledger. */
export function setLinesPaidBy(uuid: string, paidBy: Record<TenderLineId, string[]> | null) {
	const linesPaidBy = new Map(snapshot.linesPaidBy);
	if (paidBy === null) linesPaidBy.delete(uuid);
	else linesPaidBy.set(uuid, paidBy);
	publish({ ...snapshot, linesPaidBy });
}
export function useTenderMethod(uuid: string) {
	return useCheckoutMode().tenderMethods.get(uuid) ?? null;
}
export function leaveCheckout(uuid: string) {
	setLinesPaidBy(uuid, null);
	setTenderPlan(uuid, null);
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
	setTenderPlan(uuid, null);
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
/**
 * The order whose tender is on screen in the wide-screen checkout column, and whether its
 * receipt shows itself (`autoShowReceipt`). Registered by the mounted tender flow, so code
 * above the screens can tell a watched sale from one completing in the background.
 */
let watchedTender: { uuid: string; autoShowReceipt: boolean } | null = null;
export function watchTender(uuid: string, autoShowReceipt: boolean) {
	const entry = { uuid, autoShowReceipt };
	watchedTender = entry;
	return () => {
		if (watchedTender === entry) watchedTender = null;
	};
}
/**
 * A payment that settles the sale is about to write a completing status onto the order in
 * the checkout column. That status drops it from the till's open orders and unmounts the
 * column's tender, the one place that would select the receipt; so enter the receipt first,
 * as the cash path does (sale-completion), and select it once the write lands. An order nobody is
 * watching (another tab, or the phone's sheet, which is a route of its own and stays
 * mounted) is left to the background completion, as before. The watched tender is the
 * authority, not `checkoutOrders`: a checkout restored from a live ledger row after a reload
 * is on screen (resolveStage) without ever joining that set.
 *
 * The entry is unselected: a selected receipt mounts its stage, which renders (and can
 * auto-print) the resident order before the payment row and status have landed. Whether to
 * select is decided now, while the tender is still registered (its cleanup clears the watch
 * once the write unmounts the column). The caller then calls `settle()` once the write has
 * succeeded, or `undo()` when it fails and leaves the leg to retry from checkout: each part
 * `enterReceipt` changed goes back through the primitive that owns it.
 */
export interface PendingReceipt {
	settle(): void;
	undo(): void;
}
const NO_PENDING_RECEIPT: PendingReceipt = { settle: () => {}, undo: () => {} };
export function enterReceiptBeforeCompletion(uuid: string): PendingReceipt {
	if (watchedTender?.uuid !== uuid || snapshot.receiptOrders.has(uuid)) return NO_PENDING_RECEIPT;
	const select = watchedTender.autoShowReceipt;
	const before = snapshot;
	enterReceipt(uuid, { select: false });
	return {
		settle: () => {
			if (select) selectReceipt(uuid);
		},
		undo: () => {
			finishReceipt(uuid);
			setLinesPaidBy(uuid, before.linesPaidBy.get(uuid) ?? null);
			setTenderPlan(uuid, before.tenderPlans.get(uuid) ?? null);
			setTenderMethod(uuid, before.tenderMethods.get(uuid) ?? null);
			if (before.checkoutOrders.has(uuid)) enterCheckout(uuid);
			selectReceipt(before.selectedReceiptOrder);
		},
	};
}
export function finishReceipt(uuid: string) {
	setLinesPaidBy(uuid, null);
	setTenderPlan(uuid, null);
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
		tenderPlans: new Map(),
		linesPaidBy: new Map(),
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
	if (mode.checkoutOrders.has(uuid) || rows.some((row) => isLivePaymentStatus(row.status)))
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
