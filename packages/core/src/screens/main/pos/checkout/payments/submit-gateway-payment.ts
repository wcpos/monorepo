import {
	type AwaitingCustomerStamp,
	type DeclaredValues,
	type GatewaySubmitResponse,
	MetaDataEntry,
	type OrderPaymentSummary,
	type PaymentRow,
	readLedger,
	upsertPaymentRow,
	withAwaitingCustomer,
	withLedger,
} from '@wcpos/order-math';

/**
 * Submit a `gateway` capture-mode method (Payments Contract 1.2 §2, roadmap#415 R2/R4):
 * Free runs the gateway's own `process_payment()` with the declared values and answers
 * with what it did — `recorded` (a captured row, handled exactly like a manual record)
 * or `sent` (no row; the order stays the gateway's status under the awaiting-customer
 * stamp). The verb never decides the outcome; the response does. Pure apart from the
 * injected deps so the decision tree is testable.
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
	/** Mirror the server's answer into the resident order; the status is the summary's. */
	mirror: (changes: { meta_data: MetaDataEntry[]; status: string }) => Promise<void>;
	cashierId: number;
	now?: () => string;
}
export type SubmitGatewayPaymentOutcome =
	| { kind: 'recorded'; row: PaymentRow; order: OrderPaymentSummary }
	| { kind: 'sent'; order: OrderPaymentSummary; stamp: AwaitingCustomerStamp }
	/** `wcpos_fields_invalid`: a message per component id, `_form` for the gateway's own line. */
	| { kind: 'fields_invalid'; errors: Record<string, string> }
	/** A 4xx the server will repeat; `provider` is true for the gateway's own refusal. */
	| { kind: 'refused'; code: string; message: string; provider: boolean };

/** The server answered 2xx and the till's copy could not be written: the outcome stands. */
export class GatewayMirrorError extends Error {
	public constructor(
		public outcome: Extract<SubmitGatewayPaymentOutcome, { kind: 'recorded' | 'sent' }>,
		public cause: unknown
	) {
		super('Gateway outcome could not be mirrored locally.', { cause });
		this.name = 'GatewayMirrorError';
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
		const status = response?.status;
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
		if (code && status !== undefined && status >= 400 && status < 500) {
			return {
				kind: 'refused',
				code,
				message: refusalMessage(response, code),
				provider: code === 'wcpos_provider_error',
			};
		}
		// A 502 is the gateway's own refusal (a notice, an exception, a redirect elsewhere):
		// Free took nothing and put the previous method back, so it is a refusal, not an outage.
		if (code === 'wcpos_provider_error') {
			return { kind: 'refused', code, message: refusalMessage(response, code), provider: true };
		}
		throw error;
	}
	if (!data.order || typeof data.order.status !== 'string')
		throw new Error('gateway_submit_malformed_response');
	// Only the request is inside the try above: once the server has answered 2xx the outcome
	// stands, and a failure writing the till's copy must surface as that, never as a retry.
	const mirror = async (
		outcome: Extract<SubmitGatewayPaymentOutcome, { kind: 'recorded' | 'sent' }>,
		meta_data: MetaDataEntry[]
	) => {
		try {
			await deps.mirror({ meta_data, status: outcome.order.status });
		} catch (mirrorError) {
			throw new GatewayMirrorError(outcome, mirrorError);
		}
		return outcome;
	};
	if (data.outcome === 'recorded' && data.payment) {
		const row = data.payment;
		return mirror(
			{ kind: 'recorded', row, order: data.order },
			withAwaitingCustomer(
				withLedger(order.meta_data, upsertPaymentRow(readLedger(order.meta_data), row)),
				null
			)
		);
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
			withAwaitingCustomer(order.meta_data, data.order.status === 'pos-open' ? null : stamp)
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
	| { kind: 'refused'; code: string; message: string }
> {
	let summary: OrderPaymentSummary;
	try {
		const response = await deps.post(
			`orders/${order.id}/payment-methods/${stamp.method_id}/cancel`,
			{ attempt_id: stamp.attempt_id }
		);
		summary = ((response.data ?? {}) as { order?: OrderPaymentSummary }).order ?? {
			status: 'pos-open',
			total: '',
			paid: '',
			balance: '',
			payment_method: '',
			payment_method_title: '',
		};
	} catch (error) {
		const response = errorResponse(error);
		const code = response?.data?.code;
		if (code && response?.status !== undefined && response.status < 500)
			return { kind: 'refused', code, message: refusalMessage(response, code) };
		throw error;
	}
	await deps.mirror({
		meta_data: withAwaitingCustomer(order.meta_data, null),
		status: summary.status,
	});
	return { kind: 'cancelled', order: summary };
}
