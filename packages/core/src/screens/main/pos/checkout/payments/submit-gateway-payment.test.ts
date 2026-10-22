import { AWAITING_CUSTOMER_META_KEY, type MetaDataEntry, type PaymentRow } from '@wcpos/order-math';

import {
	cancelGatewayInvoice,
	GatewayCancelMirrorError,
	GatewayMirrorError,
	submitGatewayPayment,
} from './submit-gateway-payment';

const stamp = {
	method_id: 'wcpos_email_invoice',
	destination: 'old@b.c',
	attempt_id: 'attempt-0',
	sent_at_gmt: '2026-10-08T10:00:00.000Z',
	cashier_id: 7,
};
const summary = (status: string) => ({
	status,
	total: '92.95',
	paid: '0.00',
	balance: '92.95',
	payment_method: 'wcpos_email_invoice',
	payment_method_title: 'Email Invoice',
});
function row(overrides: Partial<PaymentRow> = {}): PaymentRow {
	return {
		id: 'attempt-1',
		source: 'app',
		order_id: 42,
		method_id: 'custom_gateway',
		provider: null,
		kind: 'other',
		capture_mode: 'gateway',
		transport: null,
		recorded_offline: false,
		amount: '92.95',
		currency: 'EUR',
		tendered: null,
		change: null,
		tip: null,
		status: 'captured',
		failure_reason: null,
		refunded_amount: '0.00',
		refunds: [],
		provider_refs: {},
		receipt: {},
		cashier_id: 7,
		store_id: 9,
		created_at_gmt: '2026-10-08T10:00:00.000Z',
		captured_at_gmt: '2026-10-08T10:00:00.000Z',
		updated_at_gmt: '2026-10-08T10:00:00.000Z',
		...overrides,
	};
}
const refusal = (status: number, code: string, data: Record<string, unknown> = {}) =>
	Object.assign(new Error(code), {
		response: { status, data: { code, message: `m:${code}`, data } },
	});

function harness(meta: MetaDataEntry[] = []) {
	const post = jest.fn();
	const mirror = jest.fn(async () => {});
	const order = { uuid: 'order-1', id: 42, meta_data: meta };
	const deps = {
		post,
		mirror,
		cashierId: 7,
		destination: 'new@b.c',
		now: () => '2026-10-08T12:00:00.000Z',
	};
	return { post, mirror, order, deps };
}
const input = { attemptId: 'attempt-1', values: { email: 'new@b.c', save: true } };

describe('submitGatewayPayment', () => {
	it.each([
		['on-hold', true],
		['pending', false],
		['pos-open', false],
	])('a sent invoice on %s tells the mirror whether it settles (%s)', async (status, settles) => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({ data: { outcome: 'sent', order: summary(status) } });
		await submitGatewayPayment(order, 'wcpos_email_invoice', input, deps);
		expect(mirror).toHaveBeenCalledWith(expect.objectContaining({ settles }));
	});

	it('sent: writes the stamp with the destination and the summary status, no row', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({ data: { outcome: 'sent', payment: null, order: summary('pending') } });
		const outcome = await submitGatewayPayment(order, 'wcpos_email_invoice', input, deps);
		expect(post).toHaveBeenCalledWith('orders/42/payment-methods/wcpos_email_invoice/submit', {
			attempt_id: 'attempt-1',
			values: { email: 'new@b.c', save: true },
		});
		expect(outcome).toEqual({
			kind: 'sent',
			order: summary('pending'),
			stamp: {
				method_id: 'wcpos_email_invoice',
				destination: 'new@b.c',
				attempt_id: 'attempt-1',
				sent_at_gmt: '2026-10-08T12:00:00.000Z',
				cashier_id: 7,
			},
		});
		expect(mirror).toHaveBeenCalledWith({
			order: summary('pending'),
			settles: false,
			awaiting: (outcome as { stamp: unknown }).stamp,
		});
	});
	it('sent with an open order (a replayed send cancelled elsewhere) writes no stamp', async () => {
		const { post, mirror, order, deps } = harness([
			{ key: AWAITING_CUSTOMER_META_KEY, value: stamp },
		]);
		post.mockResolvedValue({
			data: { outcome: 'sent', payment: null, order: summary('pos-open') },
		});
		await submitGatewayPayment(order, 'wcpos_email_invoice', input, deps);
		expect(mirror).toHaveBeenCalledWith({
			order: summary('pos-open'),
			awaiting: null,
			settles: false,
		});
	});
	it('recorded: mirrors the captured row into the ledger and drops any stamp', async () => {
		const { post, mirror, order, deps } = harness([
			{ key: AWAITING_CUSTOMER_META_KEY, value: stamp },
		]);
		post.mockResolvedValue({
			data: {
				outcome: 'recorded',
				payment: row(),
				order: { ...summary('completed'), balance: '0.00' },
			},
		});
		const outcome = await submitGatewayPayment(order, 'custom_gateway', input, deps);
		expect(outcome).toMatchObject({ kind: 'recorded', row: { id: 'attempt-1' } });
		// The answered row and summary; the mirror upserts it onto the latest ledger.
		expect(mirror).toHaveBeenCalledWith({
			payment: row(),
			order: { ...summary('completed'), balance: '0.00' },
			settles: true,
			awaiting: null,
		});
	});
	it('settled: no row, the stale stamp is cleared and the summary status is mirrored', async () => {
		const { post, mirror, order, deps } = harness([
			{ key: AWAITING_CUSTOMER_META_KEY, value: stamp },
		]);
		post.mockResolvedValue({
			data: { outcome: 'settled', payment: null, order: summary('pending') },
		});
		const outcome = await submitGatewayPayment(order, 'bacs', input, deps);
		expect(outcome).toEqual({ kind: 'settled', order: summary('pending') });
		expect(mirror).toHaveBeenCalledWith({
			order: summary('pending'),
			awaiting: null,
			settles: true,
		});
	});
	it('a replayed paid answer is settled: no row, the stamp is cleared, the summary is the truth', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({
			data: { outcome: 'paid', payment: null, order: summary('completed') },
		});
		expect(await submitGatewayPayment(order, 'g', input, deps)).toEqual({
			kind: 'settled',
			order: summary('completed'),
		});
		expect(mirror).toHaveBeenCalledWith({
			order: summary('completed'),
			awaiting: null,
			settles: true,
		});
	});
	// A replay answers the attempt's stored outcome with the order as it now stands: after another
	// till reopened the sale, that is open again. Mirrored, but never reported finished.
	it.each([
		['paid', 'pos-open', 'reopened'],
		['settled', 'pos-partial', 'reopened'],
		['paid', 'completed', 'settled'],
		// A merchant's settle status can be `pending` (pay by invoice): still settled.
		['settled', 'pending', 'settled'],
		['settled', 'on-hold', 'settled'],
		// A failed or cancelled order is no finished sale, whatever the stored outcome.
		['settled', 'failed', 'reopened'],
		['settled', 'cancelled', 'reopened'],
	])('a replayed %s answer with a %s summary is %s', async (outcome, status, kind) => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({ data: { outcome, payment: null, order: summary(status) } });
		expect(await submitGatewayPayment(order, 'g', input, deps)).toEqual({
			kind,
			order: summary(status),
		});
		expect(mirror).toHaveBeenCalledWith({
			order: summary(status),
			awaiting: null,
			settles: kind === 'settled',
		});
	});
	it('a settled answer whose mirror fails keeps the settled outcome in the error', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({
			data: { outcome: 'settled', payment: null, order: summary('pending') },
		});
		mirror.mockRejectedValueOnce(new Error('disk'));
		const error = await submitGatewayPayment(order, 'bacs', input, deps).catch((e) => e);
		expect(error).toBeInstanceOf(GatewayMirrorError);
		expect((error as GatewayMirrorError).outcome).toEqual({
			kind: 'settled',
			order: summary('pending'),
		});
		expect((error as GatewayMirrorError).cause).toEqual(new Error('disk'));
	});
	it('wcpos_fields_invalid lands per component; a missing map becomes the form line', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockRejectedValueOnce(
			refusal(400, 'wcpos_fields_invalid', { errors: { email: 'This field is required.' } })
		);
		expect(await submitGatewayPayment(order, 'g', input, deps)).toEqual({
			kind: 'fields_invalid',
			errors: { email: 'This field is required.' },
		});
		post.mockRejectedValueOnce(refusal(400, 'wcpos_fields_invalid'));
		expect(await submitGatewayPayment(order, 'g', input, deps)).toEqual({
			kind: 'fields_invalid',
			errors: { _form: 'm:wcpos_fields_invalid' },
		});
		expect(mirror).not.toHaveBeenCalled();
	});
	it("a 502 wcpos_provider_error is the gateway's own refusal; other 4xx are contract refusals; 5xx throws", async () => {
		const { post, order, deps } = harness();
		post.mockRejectedValueOnce(refusal(502, 'wcpos_provider_error'));
		expect(await submitGatewayPayment(order, 'g', input, deps)).toEqual({
			kind: 'refused',
			code: 'wcpos_provider_error',
			message: 'm:wcpos_provider_error',
			provider: true,
		});
		post.mockRejectedValueOnce(refusal(403, 'wcpos_payment_method_disabled'));
		expect(await submitGatewayPayment(order, 'g', input, deps)).toMatchObject({
			kind: 'refused',
			code: 'wcpos_payment_method_disabled',
			provider: false,
		});
		post.mockRejectedValueOnce(Object.assign(new Error('down'), { response: { status: 503 } }));
		await expect(submitGatewayPayment(order, 'g', input, deps)).rejects.toThrow('down');
	});
	it("a 502's detail is the gateway's own sentence; a _form list is joined", async () => {
		const { post, order, deps } = harness();
		post.mockRejectedValueOnce(
			refusal(502, 'wcpos_provider_error', { detail: 'Mail server unreachable.' })
		);
		expect(await submitGatewayPayment(order, 'g', input, deps)).toMatchObject({
			kind: 'refused',
			message: 'Mail server unreachable.',
			provider: true,
		});
		post.mockRejectedValueOnce(
			refusal(400, 'wcpos_fields_invalid', { errors: { _form: ['Too short.', 'No dots.'] } })
		);
		expect(await submitGatewayPayment(order, 'g', input, deps)).toEqual({
			kind: 'fields_invalid',
			errors: { _form: 'Too short. No dots.' },
		});
	});
	it('a mirror that fails after a 2xx keeps the outcome in the error, never a retry', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({ data: { outcome: 'sent', payment: null, order: summary('pending') } });
		mirror.mockRejectedValueOnce(new Error('disk'));
		const error = await submitGatewayPayment(order, 'g', input, deps).catch((e) => e);
		expect(error).toBeInstanceOf(GatewayMirrorError);
		expect((error as GatewayMirrorError).outcome).toMatchObject({ kind: 'sent' });
	});
	it('a malformed 2xx is an error, never an outcome', async () => {
		const { post, order, deps } = harness();
		post.mockResolvedValue({ data: { outcome: 'sent' } });
		await expect(submitGatewayPayment(order, 'g', input, deps)).rejects.toThrow(
			'gateway_submit_malformed_response'
		);
	});
});

describe('cancelGatewayInvoice', () => {
	it("names the stamp's attempt and mirrors the order back open without the stamp", async () => {
		const { post, mirror, order, deps } = harness([
			{ key: 'other', value: 1 },
			{ key: AWAITING_CUSTOMER_META_KEY, value: stamp },
		]);
		post.mockResolvedValue({ data: { order: summary('pos-open') } });
		expect(await cancelGatewayInvoice(order, stamp, deps)).toEqual({
			kind: 'cancelled',
			order: summary('pos-open'),
		});
		expect(post).toHaveBeenCalledWith('orders/42/payment-methods/wcpos_email_invoice/cancel', {
			attempt_id: 'attempt-0',
		});
		expect(mirror).toHaveBeenCalledWith({
			order: summary('pos-open'),
			awaiting: null,
			settles: false,
		});
	});
	it('an empty 2xx confirms nothing: no stamp is cleared', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({ data: {} });
		await expect(cancelGatewayInvoice(order, stamp, deps)).rejects.toThrow(
			'gateway_cancel_malformed_response'
		);
		expect(mirror).not.toHaveBeenCalled();
	});
	it('a cancelled invoice whose local write fails is still cancelled', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({ data: { order: summary('pos-open') } });
		mirror.mockRejectedValueOnce(new Error('disk'));
		const error = await cancelGatewayInvoice(order, stamp, deps).catch((e) => e);
		expect(error).toBeInstanceOf(GatewayCancelMirrorError);
		expect((error as GatewayCancelMirrorError).outcome).toEqual({
			kind: 'cancelled',
			order: summary('pos-open'),
		});
	});
	// Codex 4346411064 on #2837: the invoice still stands whether or not the mirror landed.
	it('an unchanged cancel whose local write fails is still unchanged', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({ data: { order: summary('completed') } });
		mirror.mockRejectedValueOnce(new Error('disk'));
		const error = await cancelGatewayInvoice(order, stamp, deps).catch((e) => e);
		expect((error as GatewayCancelMirrorError).outcome).toEqual({
			kind: 'unchanged',
			order: summary('completed'),
		});
	});
	// A cancel whose answer shows the order not reopened did not cancel the invoice: the summary
	// is mirrored with the stamp kept, and the outcome says so (never "cancelled").
	it('a cancel answered with an order that is not open again keeps the stamp', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({ data: { order: summary('completed') } });
		expect(await cancelGatewayInvoice(order, stamp, deps)).toEqual({
			kind: 'unchanged',
			order: summary('completed'),
		});
		expect(mirror).toHaveBeenCalledWith({
			order: summary('completed'),
			awaiting: stamp,
			settles: false,
		});
	});
	it('a refusal leaves the order alone', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockRejectedValue(refusal(409, 'wcpos_payment_conflict'));
		expect(await cancelGatewayInvoice(order, stamp, deps)).toEqual({
			kind: 'refused',
			code: 'wcpos_payment_conflict',
			message: 'm:wcpos_payment_conflict',
		});
		expect(mirror).not.toHaveBeenCalled();
	});
});
