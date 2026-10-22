import {
	type AwaitingCustomerStamp,
	type DeclaredValues,
	type GatewaySubmitResponse,
	MetaDataEntry,
	type OrderPaymentSummary,
	type PaymentRow,
} from '@wcpos/order-math';
import { isDefinitiveMoneyRefusal, isPaidStatus, moneyRefusalOf } from '@wcpos/sync-core';

/**
 * Submit a `gateway` capture-mode method (Payments Contract 1.2 §2, roadmap#415 R2/R4):
 * Free runs the gateway's own `process_payment()` with the declared values and answers
 * with what it did — `recorded` (a captured row, handled exactly like a manual record),
 * `sent` (no row; the order stays the gateway's status under the awaiting-customer stamp)
 * or `settled` (no row, no stamp: the gateway landed the order on the status the merchant
 * stored as its POS Order Status, which finishes the sale — spec §3.1). The verb never
 * decides the outcome; the response does. Pure apart from the injected deps so the
 * decision tree is testable.
 */

export interface GatewayOrder {
	uuid: string;
	id: number;
	meta_data: MetaDataEntry[];
}
export interface SubmitGatewayPaymentDeps {
	post: (url: string, body: unknown) => Promise<{ data: unknown }>;
	/** Where the gateway sent the customer, read from the declared fields (spec §3.2). */
	destination: string | null;
	/** Mirror the server's answer onto the latest resident: its row, summary and stamp. */
	mirror: (answer: {
		payment?: PaymentRow;
		order: OrderPaymentSummary;
		awaiting: AwaitingCustomerStamp | null;
	}) => Promise<void>;
	cashierId: number;
	now?: () => string;
}
export type SubmitGatewayPaymentOutcome =
	| { kind: 'recorded'; row: PaymentRow; order: OrderPaymentSummary }
	| { kind: 'sent'; order: OrderPaymentSummary; stamp: AwaitingCustomerStamp }
	| { kind: 'settled'; order: OrderPaymentSummary }
	/** A replayed `settled`/`paid` whose order was reopened since: mirrored, never finished. */
	| { kind: 'reopened'; order: OrderPaymentSummary }
	/** `wcpos_fields_invalid`: a message per component id, `_form` for the gateway's own line. */
	| { kind: 'fields_invalid'; errors: Record<string, string> }
	/** A 4xx the server will repeat; `provider` is true for the gateway's own refusal. */
	| { kind: 'refused'; code: string; message: string; provider: boolean };

/** The server answered 2xx and the till's copy could not be written: the outcome stands. */
export class GatewayMirrorError extends Error {
	public constructor(
		public outcome: Extract<
			SubmitGatewayPaymentOutcome,
			{ kind: 'recorded' | 'sent' | 'settled' | 'reopened' }
		>,
		public cause: unknown
	) {
		super('Gateway outcome could not be mirrored locally.', { cause });
		this.name = 'GatewayMirrorError';
	}
}

/** The store answered the cancel and the till's copy could not be written: the outcome stands. */
export class GatewayCancelMirrorError extends Error {
	public constructor(
		public outcome: { kind: 'cancelled' | 'unchanged'; order: OrderPaymentSummary },
		public cause: unknown
	) {
		super('Cancelled invoice could not be mirrored locally.', { cause });
		this.name = 'GatewayCancelMirrorError';
	}
}

type ErrorResponse = {
	status?: number;
	data?: { code?: string; message?: string; data?: { errors?: unknown; detail?: unknown } };
};
/** Free puts the gateway's own notice in `data.detail` under a generic `message`. */
function refusalMessage(response: ErrorResponse | undefined, code: string): string {
	const detail = response?.data?.data?.detail;
	if (typeof detail === 'string' && detail.trim() !== '') return detail;
	return response?.data?.message ?? code;
}
function errorResponse(error: unknown): ErrorResponse | undefined {
	if (!error || typeof error !== 'object') return undefined;
	const response = (error as { response?: unknown }).response;
	return response && typeof response === 'object' ? (response as ErrorResponse) : undefined;
}

/**
 * Whether a `settled` or `paid` submit answer still describes a finished sale. A replay answers
 * the attempt's stored outcome with the order as it now stands, so another till's reopen shows
 * as an open order. `paid` needs a paid status; `settled` a paid status or `pending`, which a
 * merchant can store as a gateway's settle status (pay by invoice). An open, failed or cancelled
 * order is no finished sale.
 */
export function submitStillDone(outcome: unknown, status: unknown): boolean {
	if (outcome === 'paid') return isPaidStatus(status);
	return outcome === 'settled' && (status === 'pending' || isPaidStatus(status));
}

export async function submitGatewayPayment(
	order: GatewayOrder,
	methodId: string,
	input: { attemptId: string; values: DeclaredValues },
	deps: SubmitGatewayPaymentDeps
): Promise<SubmitGatewayPaymentOutcome> {
	let data: Partial<GatewaySubmitResponse>;
	try {
		const response = await deps.post(`orders/${order.id}/payment-methods/${methodId}/submit`, {
			attempt_id: input.attemptId,
			values: input.values,
		});
		data = (response.data ?? {}) as Partial<GatewaySubmitResponse>;
	} catch (error) {
		const response = errorResponse(error);
		const code = response?.data?.code;
		if (code === 'wcpos_fields_invalid') {
			const errors = response?.data?.data?.errors;
			return {
				kind: 'fields_invalid',
				errors:
					errors && typeof errors === 'object'
						? Object.fromEntries(
								Object.entries(errors as Record<string, unknown>).map(([id, message]) => [
									id,
									// `_form` carries every notice the gateway added, as a list.
									Array.isArray(message) ? message.map(String).join(' ') : String(message),
								])
							)
						: { _form: response?.data?.message ?? '' },
			};
		}
		// The money answer rule (sync-core): a named 4xx is the store's decision, and so is a 502
		// `wcpos_provider_error`, the gateway's own refusal (a notice, an exception, a redirect
		// elsewhere: Free took nothing and put the previous method back). The poster has settled
		// the journal for both. A session or proxy answer is not, and the journal keeps the submit.
		if (code && isDefinitiveMoneyRefusal(moneyRefusalOf(error))) {
			return {
				kind: 'refused',
				code,
				message: refusalMessage(response, code),
				provider: code === 'wcpos_provider_error',
			};
		}
		throw error;
	}
	if (!data.order || typeof data.order.status !== 'string')
		throw new Error('gateway_submit_malformed_response');
	// Only the request is inside the try above: once the server has answered 2xx the outcome
	// stands, and a failure writing the till's copy must surface as that, never as a retry.
	const mirror = async (
		outcome: Extract<
			SubmitGatewayPaymentOutcome,
			{ kind: 'recorded' | 'sent' | 'settled' | 'reopened' }
		>,
		awaiting: AwaitingCustomerStamp | null
	) => {
		try {
			await deps.mirror({
				...(outcome.kind === 'recorded' ? { payment: outcome.row } : {}),
				order: outcome.order,
				awaiting,
			});
		} catch (mirrorError) {
			throw new GatewayMirrorError(outcome, mirrorError);
		}
		return outcome;
	};
	if (data.outcome === 'recorded' && data.payment) {
		const row = data.payment;
		return mirror({ kind: 'recorded', row, order: data.order }, null);
	}
	// A replay answers `paid` for an attempt that completed the sale: the same as `settled`, with
	// the summary as the truth and no receipt number assumed.
	if (
		(data.outcome === 'settled' || data.outcome === 'paid') &&
		!submitStillDone(data.outcome, data.order.status)
	)
		return mirror({ kind: 'reopened', order: data.order }, null);
	if (data.outcome === 'settled' || data.outcome === 'paid') {
		// The store settled the sale on the merchant's stored status and cleared any stamp an
		// earlier send left (§3.1); the till's copy follows, with the summary's status.
		return mirror({ kind: 'settled', order: data.order }, null);
	}
	if (data.outcome === 'sent') {
		const stamp: AwaitingCustomerStamp = {
			method_id: methodId,
			destination: deps.destination,
			attempt_id: input.attemptId,
			sent_at_gmt: (deps.now ?? (() => new Date().toISOString()))(),
			cashier_id: deps.cashierId,
		};
		// A `sent` whose summary is still pos-open is a replay of an earlier send after a later
		// one was cancelled elsewhere (§4.2): the order is open, and the stamp is not ours to write.
		return mirror(
			{ kind: 'sent', order: data.order, stamp },
			data.order.status === 'pos-open' ? null : stamp
		);
	}
	throw new Error('gateway_submit_malformed_response');
}

/** `POST …/payment-methods/{method}/cancel` (§2.2): the order comes back pos-open, the stamp goes. */
export async function cancelGatewayInvoice(
	order: GatewayOrder,
	stamp: AwaitingCustomerStamp,
	deps: Pick<SubmitGatewayPaymentDeps, 'post' | 'mirror'>
): Promise<
	| { kind: 'cancelled'; order: OrderPaymentSummary }
	/** Answered, but the order is not open again: the invoice was not cancelled. */
	| { kind: 'unchanged'; order: OrderPaymentSummary }
	| { kind: 'refused'; code: string; message: string }
> {
	let summary: OrderPaymentSummary;
	try {
		const response = await deps.post(
			`orders/${order.id}/payment-methods/${stamp.method_id}/cancel`,
			{ attempt_id: stamp.attempt_id }
		);
		const answer = ((response.data ?? {}) as { order?: OrderPaymentSummary }).order;
		// Only the store's own summary says what the order is now; an empty 2xx confirms nothing.
		if (!answer || typeof answer.status !== 'string')
			throw new Error('gateway_cancel_malformed_response');
		summary = answer;
	} catch (error) {
		const response = errorResponse(error);
		const code = response?.data?.code;
		if (code && isDefinitiveMoneyRefusal(moneyRefusalOf(error)))
			return { kind: 'refused', code, message: refusalMessage(response, code) };
		throw error;
	}
	// A cancel reopens the order (`pos-open`, or `pos-partial` beside earlier legs). An answer
	// with the order anywhere else did not cancel the invoice: the summary is mirrored with the
	// stamp kept, and the outcome says so; a re-send would replay the same stored reply.
	const reopened = summary.status === 'pos-open' || summary.status === 'pos-partial';
	const outcome = { kind: reopened ? 'cancelled' : 'unchanged', order: summary } as const;
	try {
		await deps.mirror({ order: summary, awaiting: reopened ? null : stamp });
	} catch (mirrorError) {
		throw new GatewayCancelMirrorError(outcome, mirrorError);
	}
	return outcome;
}
