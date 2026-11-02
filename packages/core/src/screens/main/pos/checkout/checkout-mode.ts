import * as React from 'react';

import isEqual from 'lodash/isEqual';

import { isLivePaymentStatus, type PaymentRow, readLedger } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { isPaidStatus } from '@wcpos/sync-core';

import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { RefusedWire } from './refused-wire';
import type { TenderLineId, TenderPlan } from './tender/tender-state';

export type OrderSaveState =
	| { kind: 'saving' }
	| { kind: 'queued-offline'; mutationId: string }
	| {
			kind: 'rejected';
			status: number | null;
			reason: string | null;
			message: string | null;
			/** The wire projection of the payload the store refused; `null` when unknown. */
			refused: RefusedWire | null;
			/**
			 * A `conflicted` or `needs-revision` row: the drain blocks every later write of the
			 * record until it is resolved, so a changed cart is no retry.
			 */
			parked: boolean;
	  };

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
// Finishing an unconfirmed receipt skips the confirmation's unselected entry once,
// so it cannot restore the dismissed tab and its released print claim.
const finishedBeforeCompletion = new Set<string>();
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
/** A refused order holds until a `retry` (Pay on a cart changed since the refusal). */
export function markOrderSaving(uuid: string, options?: { retry?: boolean }) {
	if (getOrderSaveState(uuid)?.kind === 'rejected' && !options?.retry) return;
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
	rejection: Omit<Extract<OrderSaveState, { kind: 'rejected' }>, 'kind' | 'refused' | 'parked'> & {
		refused?: RefusedWire | null;
		parked?: boolean;
	}
) {
	// The durable mirror can land before or after the save hook's own mark, which knows
	// neither the payload nor the row's status: what the mirror knew is never downgraded.
	const current = getOrderSaveState(uuid);
	const known = current?.kind === 'rejected' ? current : null;
	setOrderSaveState(uuid, {
		...rejection,
		kind: 'rejected',
		refused: rejection.refused ?? known?.refused ?? null,
		parked: rejection.parked ?? known?.parked ?? false,
	});
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
	finishedBeforeCompletion.delete(uuid);
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
	publish({ ...snapshot, checkoutOrders, selectedReceiptOrder: withoutProvisional(uuid) });
}
/** The selection, minus a derived (never confirmed) receipt of this order. */
function withoutProvisional(uuid: string) {
	return snapshot.selectedReceiptOrder === uuid && !snapshot.receiptOrders.has(uuid)
		? null
		: snapshot.selectedReceiptOrder;
}
/**
 * Move an order to its receipt stage. Selecting it brings the receipt on screen,
 * which is right when the cashier just took the final payment here — and wrong
 * when a terminal leg completes in the background for an order they are not
 * serving: that order keeps its tab ("Paid · receipt") and waits to be tapped.
 */
export function enterReceipt(uuid: string, { select = true }: { select?: boolean } = {}) {
	if (!select && finishedBeforeCompletion.delete(uuid)) return;
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
export function finishReceipt(uuid: string) {
	if (snapshot.checkoutOrders.has(uuid)) finishedBeforeCompletion.add(uuid);
	leaveCheckout(uuid);
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
	finishedBeforeCompletion.clear();
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

/**
 * A sale the completion could not confirm (reopened, cancelled, unrefreshed) gives back what
 * its derived receipt took: the auto-print claim, so the next paid attempt prints once, and a
 * selection the cashier made on it before confirmation, so a reopened order shows its tender.
 */
export function releaseUnconfirmedReceipt(uuid: string): void {
	receiptPrintAttempts.delete(uuid);
	const selectedReceiptOrder = withoutProvisional(uuid);
	if (selectedReceiptOrder !== snapshot.selectedReceiptOrder)
		publish({ ...snapshot, selectedReceiptOrder });
}

export function isReceiptStage(
	uuid: string,
	mode: CheckoutModeSnapshot,
	status: string | null | undefined
): boolean {
	return mode.receiptOrders.has(uuid) || (mode.checkoutOrders.has(uuid) && isPaidStatus(status));
}

export function resolveStage(
	uuid: string | undefined,
	mode: CheckoutModeSnapshot,
	rows: PaymentRow[],
	status: string | null | undefined
): 'cart' | 'checkout' | 'receipt' {
	if (!uuid) return 'cart';
	if (isReceiptStage(uuid, mode, status)) return 'receipt';
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
	const status = useRecordField(record, (order) => order.payload.status);
	// A draft has no ledger to derive from, but Pay can flag it before its first
	// save lands; the explicit store entry must swap the columns for it too.
	const isNew = Boolean((record as { isNew?: boolean } | undefined)?.isNew);
	return resolveStage(record?.uuid, mode, isNew ? [] : readLedger(meta), status);
}
