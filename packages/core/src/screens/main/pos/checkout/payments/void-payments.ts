import { isOfflineDeviceAuthorization, partitionVoidableRows } from '@wcpos/order-math';
import type { MetaDataEntry, OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';
import { isDefinitiveMoneyRefusal, moneyRefusalOf } from '@wcpos/sync-core';

/**
 * Void the live payment legs when a cashier abandons a half-paid order. Offline a void is
 * refused (ADR 0040 §offline); online voids stay sequential because each response recomputes
 * the server's order status.
 */

export interface VoidPaymentsOrder {
	uuid: string;
	id: number | null;
	meta_data: MetaDataEntry[];
}
export interface VoidPaymentsDeps {
	post: (url: string, body: unknown) => Promise<{ data: unknown }>;
	isOnline: () => boolean;
	/** Online void mirrors each answered row onto the latest resident; no second write. */
	mirror: (answer: { payment: PaymentRow; order: OrderPaymentSummary | null }) => Promise<void>;
}
export interface VoidPaymentsFailure {
	paymentId: string;
	message: string;
	/**
	 * True only when the STORE decided: a definitive refusal under the money answer rule
	 * (sync-core `isDefinitiveMoneyRefusal`). A transport failure, a held lock, a session,
	 * proxy or rate-limit answer, or a 5xx leaves this false, because the void may well have
	 * been applied (the journal keeps it for a re-send): telling the cashier to refund by hand
	 * in that case is how one void becomes two refunds.
	 */
	refused: boolean;
}
export type VoidPaymentsOutcome =
	| {
			kind: 'voided';
			/** `offline`: nothing was live to void, so nothing was sent. */
			via: 'online' | 'offline';
			/** The rows that ended up voided, in ledger order. */
			rows: PaymentRow[];
			/** Live rows this cancel did not void: refused, unknown, unsent, or captured for good. */
			failed: VoidPaymentsFailure[];
			order: OrderPaymentSummary | null;
	  }
	/**
	 * No connection: nothing was sent and nothing voided. Not a refusal: the store never answered
	 * and the legs are still held on it, so the cashier is told the cancel needs a connection,
	 * never to refund by hand.
	 */
	| { kind: 'offline'; paymentIds: string[] };
export async function voidPayments(
	order: VoidPaymentsOrder,
	deps: VoidPaymentsDeps
): Promise<VoidPaymentsOutcome> {
	const { voidable: liveRows, retained: kept } = partitionVoidableRows(order.meta_data);
	// #2798 thread 4341491614: such a leg is never sent a void, but it is reported, so a cancel
	// that leaves money captured is never read as a clean one. The store's own rule, so `refused`.
	const retained: VoidPaymentsFailure[] = kept.map((row) => ({
		paymentId: row.id,
		message: 'captured_refund_required',
		refused: true,
	}));
	if (liveRows.length === 0) {
		return { kind: 'voided', via: 'offline', rows: [], failed: retained, order: null };
	}

	const online = deps.isOnline() && Number.isInteger(order.id) && Number(order.id) > 0;
	// A void the server cannot hear is not sent, and nothing is voided locally: the offline tender
	// outbox journals manual `offline: 'record'` payments only (ADR 0040 Decided 1 rule 2; a device
	// `queue` is a later slice). A retained captured leg is reported once a cancel can reach the store.
	if (!online) return { kind: 'offline', paymentIds: liveRows.map(({ id }) => id) };
	const deviceHeld = liveRows.filter(isOfflineDeviceAuthorization);
	if (deviceHeld.length)
		return {
			kind: 'voided',
			via: 'online',
			rows: [],
			failed: [
				...deviceHeld.map((row) => ({
					refused: true,
					paymentId: row.id,
					message: 'Device payment must settle before cancellation',
				})),
				...retained,
			],
			order: null,
		};
	let lastOrder: OrderPaymentSummary | null = null;
	const rows: PaymentRow[] = [];
	const failed: VoidPaymentsFailure[] = [...retained];
	for (const row of liveRows) {
		let accepted: { payment: PaymentRow; order: OrderPaymentSummary };
		try {
			const response = await deps.post(`orders/${order.id}/payments/${row.id}/void`, {});
			accepted = response.data as { payment: PaymentRow; order: OrderPaymentSummary };
		} catch (error) {
			const refusal = moneyRefusalOf(error);
			failed.push({
				paymentId: row.id,
				message:
					refusal?.message || (error instanceof Error && error.message ? error.message : row.id),
				// Only the store's decision is a refusal; anything the journal keeps is unknown.
				refused: isDefinitiveMoneyRefusal(refusal),
			});
			continue;
		}
		// Mirrored (and settled) before the next void is sent: a settle only ever deletes the
		// entry of a void whose row is already mirrored, so a failed refresh or a crash between
		// two voids leaves the next one journaled, never live with no entry.
		await deps.mirror(accepted);
		lastOrder = accepted.order;
		// The store's answer is mirrored and settled either way (a re-send would replay the same
		// stored reply), but a row it still holds live was not voided: reported unknown, never
		// voided, so the cashier is never told the money went back.
		if (accepted.payment.status === 'voided') rows.push(accepted.payment);
		else failed.push({ paymentId: row.id, message: 'void_not_applied', refused: false });
	}
	if (rows.length === 0) {
		return { kind: 'voided', via: 'online', rows, failed, order: null };
	}
	return { kind: 'voided', via: 'online', rows, failed, order: lastOrder };
}
