import {
	type MetaDataEntry,
	type PaymentRow,
	readAwaitingCustomer,
	readGatewayAttempts,
	withAwaitingCustomer,
	withGatewayAttempt,
} from '@wcpos/order-math';

import {
	cancelGatewayAttempt,
	submitGatewayPayment,
	type SubmitGatewayPaymentDeps,
} from './submit-gateway-payment';

const stamp = {
	method_id: 'wcpos_email_invoice',
	destination: 'old@b.c',
	attempt_id: 'attempt-0',
	sent_at_gmt: '2026-10-08T10:00:00.000Z',
	cashier_id: 7,
};
const invoice = { methodId: stamp.method_id, attemptId: stamp.attempt_id, awaiting: stamp };
const attemptsOf = (meta: MetaDataEntry[]) =>
	(
		meta.find(({ key }) => key === '_wcpos_gateway_attempts')?.value as {
			attempts: Record<string, object>;
		}
	).attempts;
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
	const post = Object.assign(jest.fn(), { settle: jest.fn(async () => undefined) });
	// Each mirrored answer as the order reads after its meta patch: the stamp it leaves.
	const mirror = jest.fn(async (_answer: object): Promise<{ cause: unknown } | null> => null);
	const written: MetaDataEntry[][] = [];
	const order = { uuid: 'order-1', id: 42, meta_data: meta };
	const deps = {
		post,
		mirror: ({ meta: patch, ...answer }: Parameters<SubmitGatewayPaymentDeps['mirror']>[0]) => {
			if (!patch) return mirror(answer);
			const next = patch(meta);
			written.push(next);
			return mirror({ ...answer, awaiting: readAwaitingCustomer(next) });
		},
		cashierId: 7,
		destination: 'new@b.c',
		now: () => '2026-10-08T12:00:00.000Z',
	};
	return { post, mirror, order, deps, written };
}
const input = { attemptId: 'attempt-1', values: { email: 'new@b.c', save: true } };

describe('submitGatewayPayment', () => {
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
			notMirrored: null,
		});
		expect(mirror).toHaveBeenCalledWith({
			order: summary('pending'),
			awaiting: (outcome as { stamp: unknown }).stamp,
		});
	});
	it('sent with an open order (a replayed send cancelled elsewhere) writes no stamp', async () => {
		const { post, mirror, order, deps } = harness(withAwaitingCustomer([], stamp));
		post.mockResolvedValue({
			data: { outcome: 'sent', payment: null, order: summary('pos-open') },
		});
		await submitGatewayPayment(order, 'wcpos_email_invoice', input, deps);
		expect(mirror).toHaveBeenCalledWith({
			order: summary('pos-open'),
			awaiting: null,
		});
	});
	it('recorded: mirrors the captured row into the ledger and drops any stamp', async () => {
		const { post, mirror, order, deps } = harness(withAwaitingCustomer([], stamp));
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
			awaiting: null,
		});
	});
	it('settled: no row, the stale stamp is cleared and the summary status is mirrored', async () => {
		const { post, mirror, order, deps } = harness(withAwaitingCustomer([], stamp));
		post.mockResolvedValue({
			data: { outcome: 'settled', payment: null, order: summary('pending') },
		});
		const outcome = await submitGatewayPayment(order, 'bacs', input, deps);
		expect(outcome).toEqual({ kind: 'settled', order: summary('pending'), notMirrored: null });
		expect(mirror).toHaveBeenCalledWith({
			order: summary('pending'),
			awaiting: null,
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
			notMirrored: null,
		});
		expect(mirror).toHaveBeenCalledWith({
			order: summary('completed'),
			awaiting: null,
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
			notMirrored: null,
		});
		expect(mirror).toHaveBeenCalledWith({
			order: summary(status),
			awaiting: null,
		});
	});
	it('a settled answer whose mirror fails keeps the settled outcome, marked not mirrored', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({
			data: { outcome: 'settled', payment: null, order: summary('pending') },
		});
		mirror.mockResolvedValueOnce({ cause: new Error('disk') });
		expect(await submitGatewayPayment(order, 'bacs', input, deps)).toEqual({
			kind: 'settled',
			order: summary('pending'),
			notMirrored: { cause: new Error('disk') },
		});
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
	// #2900: an attempt with no outcome yet is not a refusal; a live row stays one.
	it('a 409 wcpos_payment_in_flight naming an attempt is unanswered; naming a row, refused', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockRejectedValueOnce(refusal(409, 'wcpos_payment_in_flight', { attempt_id: 'other' }));
		expect(await submitGatewayPayment(order, 'g', input, deps)).toEqual({
			kind: 'unanswered',
			attemptId: 'other',
		});
		post.mockRejectedValueOnce(refusal(409, 'wcpos_payment_in_flight', { payment_id: 'p-1' }));
		expect(await submitGatewayPayment(order, 'g', input, deps)).toEqual({
			kind: 'refused',
			code: 'wcpos_payment_in_flight',
			message: 'm:wcpos_payment_in_flight',
			provider: false,
		});
		expect(mirror).not.toHaveBeenCalled();
	});
	it('an unanswered attempt runs one forced refresh, so the resident carries the attempt', async () => {
		const { post, order, deps } = harness();
		post.mockRejectedValueOnce(refusal(409, 'wcpos_payment_in_flight', { attempt_id: 'other' }));
		await submitGatewayPayment(order, 'g', input, deps);
		expect(post.settle).toHaveBeenCalledTimes(1);
		post.mockRejectedValueOnce(refusal(409, 'wcpos_payment_in_flight', { payment_id: 'p-1' }));
		await submitGatewayPayment(order, 'g', input, deps);
		expect(post.settle).toHaveBeenCalledTimes(1);
	});
	it('a replay the resolver minted (row id = the attempt id) is recorded', async () => {
		const { post, order, deps } = harness();
		const minted = row({ id: input.attemptId });
		post.mockResolvedValue({
			data: { outcome: 'recorded', payment: minted, order: summary('completed') },
		});
		expect(await submitGatewayPayment(order, 'g', input, deps)).toMatchObject({
			kind: 'recorded',
			row: { id: input.attemptId },
		});
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
	it('a mirror that fails after a 2xx keeps the outcome, never a retry', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({ data: { outcome: 'sent', payment: null, order: summary('pending') } });
		mirror.mockResolvedValueOnce({ cause: new Error('disk') });
		expect(await submitGatewayPayment(order, 'g', input, deps)).toMatchObject({
			kind: 'sent',
			notMirrored: { cause: new Error('disk') },
		});
		expect(post).toHaveBeenCalledTimes(1);
	});
	it('a malformed 2xx is an error, never an outcome', async () => {
		const { post, order, deps } = harness();
		post.mockResolvedValue({ data: { outcome: 'sent' } });
		await expect(submitGatewayPayment(order, 'g', input, deps)).rejects.toThrow(
			'gateway_submit_malformed_response'
		);
	});
});

describe('cancelGatewayAttempt: Cancel invoice', () => {
	it("names the stamp's attempt and mirrors the order back open without the stamp", async () => {
		const { post, mirror, order, deps } = harness(
			withAwaitingCustomer([{ key: 'other', value: 1 }], stamp)
		);
		post.mockResolvedValue({ data: { order: summary('pos-open') } });
		expect(await cancelGatewayAttempt(order, invoice, deps)).toEqual({
			kind: 'answered',
			reopened: true,
			order: summary('pos-open'),
			notMirrored: null,
		});
		expect(post).toHaveBeenCalledWith('orders/42/payment-methods/wcpos_email_invoice/cancel', {
			attempt_id: 'attempt-0',
		});
		expect(mirror).toHaveBeenCalledWith({
			order: summary('pos-open'),
			awaiting: null,
			accepted: false,
		});
	});
	it('an accepted Cancel invoice cancels the attempt: nothing reads unanswered after it', async () => {
		const { post, order, deps, written } = harness(withAwaitingCustomer([], stamp));
		post.mockResolvedValue({ data: { order: summary('pos-open') } });
		await cancelGatewayAttempt(order, invoice, deps);
		expect(readGatewayAttempts(written[0]).unanswered).toBeNull();
		expect(attemptsOf(written[0])['attempt-0']).toMatchObject({
			fate: 'cancelled',
			awaiting: null,
		});
	});
	it('an empty 2xx confirms nothing: no stamp is cleared', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({ data: {} });
		await expect(cancelGatewayAttempt(order, invoice, deps)).rejects.toThrow(
			'gateway_cancel_malformed_response'
		);
		expect(mirror).not.toHaveBeenCalled();
	});
	it('a cancelled invoice whose local write fails is still cancelled', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({ data: { order: summary('pos-open') } });
		mirror.mockResolvedValueOnce({ cause: new Error('disk') });
		expect(await cancelGatewayAttempt(order, invoice, deps)).toEqual({
			kind: 'answered',
			reopened: true,
			order: summary('pos-open'),
			notMirrored: { cause: new Error('disk') },
		});
	});
	// Codex 4346411064 on #2837: the invoice still stands whether or not the mirror landed.
	it('an unchanged cancel whose local write fails is still unchanged', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({ data: { order: summary('completed') } });
		mirror.mockResolvedValueOnce({ cause: new Error('disk') });
		expect(await cancelGatewayAttempt(order, invoice, deps)).toEqual({
			kind: 'answered',
			reopened: false,
			order: summary('completed'),
			notMirrored: { cause: new Error('disk') },
		});
	});
	// A cancel whose answer shows the order not reopened did not cancel the invoice: the summary
	// is mirrored with the stamp kept, and the outcome says so (never "cancelled").
	it('a cancel answered with an order that is not open again keeps the stamp', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockResolvedValue({ data: { order: summary('completed') } });
		expect(await cancelGatewayAttempt(order, invoice, deps)).toEqual({
			kind: 'answered',
			reopened: false,
			order: summary('completed'),
			notMirrored: null,
		});
		expect(mirror).toHaveBeenCalledWith({
			order: summary('completed'),
			awaiting: stamp,
			accepted: false,
		});
	});
	it('a refusal leaves the order alone', async () => {
		const { post, mirror, order, deps } = harness();
		post.mockRejectedValue(refusal(409, 'wcpos_payment_conflict'));
		expect(await cancelGatewayAttempt(order, invoice, deps)).toEqual({
			kind: 'refused',
			code: 'wcpos_payment_conflict',
			message: 'm:wcpos_payment_conflict',
		});
		expect(mirror).not.toHaveBeenCalled();
	});
});

describe('cancelGatewayAttempt: the clear of an unanswered attempt', () => {
	const stranded = { methodId: 'custom_gateway', attemptId: 'attempt-9' };
	const meta = withGatewayAttempt(withAwaitingCustomer([], stamp), 'attempt-9', {
		fate: 'sent',
		method_id: 'custom_gateway',
		awaiting: null,
	});
	it('a 200 pos-open is cleared and reopened: the attempt cancelled, the stamp untouched', async () => {
		const { post, mirror, order, deps, written } = harness(meta);
		expect(readGatewayAttempts(meta).unanswered?.id).toBe('attempt-9');
		post.mockResolvedValue({ data: { order: summary('pos-open') } });
		expect(await cancelGatewayAttempt(order, stranded, deps)).toEqual({
			kind: 'answered',
			reopened: true,
			order: summary('pos-open'),
			notMirrored: null,
		});
		expect(post).toHaveBeenCalledWith('orders/42/payment-methods/custom_gateway/cancel', {
			attempt_id: 'attempt-9',
		});
		expect(mirror).toHaveBeenCalledWith({
			order: summary('pos-open'),
			awaiting: stamp,
			accepted: false,
		});
		expect(readGatewayAttempts(written[0]).unanswered).toBeNull();
	});
	it('a 200 that does not reopen is answered, not reopened; the attempt is still cancelled', async () => {
		const { post, order, deps, written } = harness(meta);
		post.mockResolvedValue({ data: { order: summary('on-hold') } });
		expect(await cancelGatewayAttempt(order, stranded, deps)).toMatchObject({
			kind: 'answered',
			reopened: false,
		});
		expect(attemptsOf(written[0])['attempt-9']).toMatchObject({ fate: 'cancelled' });
	});
	it('409 wcpos_invalid_transition is refused, nothing mirrored', async () => {
		const { post, mirror, order, deps } = harness(meta);
		post.mockRejectedValue(refusal(409, 'wcpos_invalid_transition'));
		expect(await cancelGatewayAttempt(order, stranded, deps)).toEqual({
			kind: 'refused',
			code: 'wcpos_invalid_transition',
			message: 'm:wcpos_invalid_transition',
		});
		expect(mirror).not.toHaveBeenCalled();
	});
});
