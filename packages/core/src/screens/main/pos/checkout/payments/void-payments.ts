import { isLivePaymentStatus, readCompletions, readLedger } from '@wcpos/order-math';
import type { MetaDataEntry, OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';

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
	 * True when the STORE answered and refused. A transport failure — a timeout, a
	 * dropped connection — leaves this false, because the void may well have been
	 * applied: telling the cashier to refund by hand in that case is how one void
	 * becomes two refunds.
	 */
	refused: boolean;
}
export type VoidPaymentsOutcome = {
	kind: 'voided';
	via: 'online' | 'offline';
	/** The rows that ended up voided, in ledger order. */
	rows: PaymentRow[];
	/** Rows the server refused to void; still live, still owed back to the customer. */
	failed: VoidPaymentsFailure[];
	order: OrderPaymentSummary | null;
};
type ErrorResponse = { data?: { message?: string } };
function errorResponse(error: unknown): ErrorResponse | undefined {
	if (!error || typeof error !== 'object') return undefined;
	const response = (error as { response?: unknown }).response;
	return response && typeof response === 'object' ? (response as ErrorResponse) : undefined;
}
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

	const now = deps.now ?? (() => new Date().toISOString());
	const online = deps.isOnline() && Number.isInteger(order.id) && Number(order.id) > 0;
	// ADR 0040 PR A: a void the server cannot hear is refused, and nothing is voided locally.
	if (!online)
		return {
			kind: 'voided',
			via: 'offline',
			rows: [],
			failed: liveRows.map((row) => ({
				refused: true,
				paymentId: row.id,
				message: 'offline_unavailable',
			})),
			order: null,
		};
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
		const localVoid = { ...row, status: 'voided' as const, updated_at_gmt: now() };
		try {
			const response = await deps.post(`orders/${order.id}/payments/${row.id}/void`, {});
			const accepted = (response.data ?? {}) as {
				payment?: PaymentRow;
				order?: OrderPaymentSummary;
			};
			const serverRow = accepted.payment ?? localVoid;
			answers.push({ payment: serverRow, order: accepted.order ?? null });
			rows.push(serverRow);
			// Keep the most recent summary the server DID send: a later response that
			// omits one must not throw away the order status an earlier one gave us.
			if (accepted.order) lastOrder = accepted.order;
		} catch (error) {
			const response = errorResponse(error);
			failed.push({
				paymentId: row.id,
				message:
					response?.data?.message ||
					(error instanceof Error && error.message ? error.message : row.id),
				// The store answered at all — even with a refusal message — means the void was
				// decided. No response object means the request never completed.
				refused: response !== undefined,
			});
		}
	}
	if (rows.length === 0) {
		return { kind: 'voided', via: 'online', rows, failed, order: null };
	}
	for (const answer of answers) await deps.mirror(answer);
	return { kind: 'voided', via: 'online', rows, failed, order: lastOrder };
}
