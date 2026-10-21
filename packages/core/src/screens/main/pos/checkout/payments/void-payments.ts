import { isLivePaymentStatus, readCompletions, readLedger } from '@wcpos/order-math';
import type { MetaDataEntry, OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';
import { isDefinitiveMoneyRefusal, isMoneyAnswer, moneyRefusalOf } from '@wcpos/sync-core';

/**
 * Void the live payment legs when a cashier abandons a half-paid order. Offline a void is
 * refused (ADR 0040 PR A); online voids stay sequential because each response recomputes
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
	now?: () => string;
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
			via: 'online' | 'offline';
			/** The rows that ended up voided, in ledger order. */
			rows: PaymentRow[];
			/** Rows the server refused to void; still live, still owed back to the customer. */
			failed: VoidPaymentsFailure[];
			order: OrderPaymentSummary | null;
	  }
	/**
	 * Offline (ADR 0040 PR A): nothing was sent and nothing voided. Not a refusal: the store
	 * never answered, and the legs are still captured on it, so the cashier is told the cancel
	 * needs a connection, never to refund by hand.
	 */
	| { kind: 'offline'; paymentIds: string[] };
export async function voidPayments(
	order: VoidPaymentsOrder,
	deps: VoidPaymentsDeps
): Promise<VoidPaymentsOutcome> {
	// The server never voids a captured row a completion counted, nor a captured non-manual row
	// (an adopted WooCommerce tender among them): those leave the balance only through a refund.
	const counted = new Set(
		readCompletions(order.meta_data).flatMap(({ payment_ids }) => payment_ids ?? [])
	);
	const liveRows = readLedger(order.meta_data).filter(
		({ id, status, capture_mode }) =>
			isLivePaymentStatus(status) &&
			(status !== 'captured' || (capture_mode === 'manual' && !counted.has(id)))
	);
	if (liveRows.length === 0) {
		return { kind: 'voided', via: 'offline', rows: [], failed: [], order: null };
	}

	const online = deps.isOnline() && Number.isInteger(order.id) && Number(order.id) > 0;
	// ADR 0040 PR A: a void the server cannot hear is not sent, and nothing is voided locally.
	if (!online) return { kind: 'offline', paymentIds: liveRows.map(({ id }) => id) };
	const deviceHeld = liveRows.filter(
		(row) => row.capture_mode === 'device' && row.recorded_offline && row.status === 'authorized'
	);
	if (deviceHeld.length)
		return {
			kind: 'voided',
			via: 'online',
			rows: [],
			failed: deviceHeld.map((row) => ({
				refused: true,
				paymentId: row.id,
				message: 'Device payment must settle before cancellation',
			})),
			order: null,
		};
	let lastOrder: OrderPaymentSummary | null = null;
	const answers: { payment: PaymentRow; order: OrderPaymentSummary | null }[] = [];
	const rows: PaymentRow[] = [];
	const failed: VoidPaymentsFailure[] = [];
	for (const row of liveRows) {
		try {
			const response = await deps.post(`orders/${order.id}/payments/${row.id}/void`, {});
			// Only the store's own row and summary say the leg was voided (sync-core
			// `isMoneyAnswer`): a malformed 2xx is never replaced by a locally voided row. It is an
			// unknown outcome, and the journal keeps the void for a re-send.
			if (!isMoneyAnswer('void', response.data)) throw new Error('money_command_malformed_answer');
			const accepted = response.data as { payment: PaymentRow; order: OrderPaymentSummary };
			answers.push({ payment: accepted.payment, order: accepted.order });
			rows.push(accepted.payment);
			lastOrder = accepted.order;
		} catch (error) {
			const refusal = moneyRefusalOf(error);
			failed.push({
				paymentId: row.id,
				message:
					refusal?.message || (error instanceof Error && error.message ? error.message : row.id),
				// Only the store's decision is a refusal; anything the journal keeps is unknown.
				refused: isDefinitiveMoneyRefusal(refusal),
			});
		}
	}
	if (rows.length === 0) {
		return { kind: 'voided', via: 'online', rows, failed, order: null };
	}
	for (const answer of answers) await deps.mirror(answer);
	return { kind: 'voided', via: 'online', rows, failed, order: lastOrder };
}
