import type { PaymentRow } from '@wcpos/order-math';

import { voidPayments } from './void-payments';

import type { VoidPaymentsDeps } from './void-payments';

const NOW = '2026-09-03T10:00:00.000Z';

function payment(id: string, status: PaymentRow['status']): PaymentRow {
	return {
		id,
		source: 'app',
		order_id: 42,
		method_id: 'pos_cash',
		provider: null,
		kind: 'cash',
		capture_mode: 'manual',
		transport: null,
		recorded_offline: false,
		amount: '10.00',
		currency: 'EUR',
		tendered: '10.00',
		change: '0.00',
		tip: null,
		status,
		failure_reason: status === 'failed' ? 'declined' : null,
		refunded_amount: '0.00',
		refunds: [],
		provider_refs: {},
		receipt: {},
		cashier_id: 7,
		store_id: 9,
		created_at_gmt: NOW,
		captured_at_gmt: status === 'captured' ? NOW : null,
		updated_at_gmt: NOW,
	};
}

function order(rows: PaymentRow[], id: number | null = 42) {
	return {
		uuid: 'order-uuid',
		id,
		meta_data: [
			{ id: 5, key: '_pos_user', value: '7' },
			{ key: '_wcpos_payments', value: { schema: 1, payments: rows } },
		],
	};
}

function createDeps(online = true): VoidPaymentsDeps & {
	post: jest.Mock;
	mirror: jest.Mock;
} {
	return {
		post: jest.fn(),
		isOnline: () => online,
		mirror: jest.fn(async () => undefined),
	};
}

/** The store's answer to a void: its voided row and the order summary. */
const answered = (url: string) => {
	const id = url.split('/').at(-2)!;
	return {
		data: {
			payment: { ...payment(id, 'captured'), status: 'voided' },
			order: { status: 'pos-open' },
		},
	};
};

describe('voidPayments', () => {
	it('writes nothing when the ledger has no live legs', async () => {
		const deps = createDeps();

		const result = await voidPayments(
			order([payment('v', 'voided'), payment('f', 'failed')]),
			deps
		);

		expect(result).toEqual({
			kind: 'voided',
			via: 'offline',
			rows: [],
			failed: [],
			order: null,
		});
		expect(deps.post).not.toHaveBeenCalled();
		expect(deps.mirror).not.toHaveBeenCalled();
	});

	// ADR 0040 PR A: a void the server cannot hear is not sent; nothing is voided locally, and
	// no row is reported refused (the store never answered, so no hand refund is promised).
	it('offline voids nothing and reports its own outcome, never a refusal', async () => {
		const deps = createDeps(false);
		const rows = [
			payment('pending', 'pending'),
			payment('voided', 'voided'),
			payment('authorized', 'authorized'),
			payment('captured', 'captured'),
		];

		const result = await voidPayments(order(rows), deps);

		expect(result).toEqual({
			kind: 'offline',
			paymentIds: ['pending', 'authorized', 'captured'],
		});
		expect(deps.post).not.toHaveBeenCalled();
		expect(deps.mirror).not.toHaveBeenCalled();
	});

	it('a captured row counted in a completion, or an adopted woocommerce tender, is not sent to void', async () => {
		const deps = createDeps();
		deps.post.mockImplementation(async (url: string) => answered(url));
		const counted = payment('counted', 'captured');
		const adopted = { ...payment('adopted', 'captured'), capture_mode: 'server' as const };
		const open = payment('open', 'captured');
		const voidable = order([counted, adopted, open]);
		const history = { key: '_wcpos_completions', value: [{ payment_ids: ['counted'] }] };
		voidable.meta_data.push(history as never);

		const result = await voidPayments(voidable, deps);

		expect(deps.post.mock.calls.map(([url]) => url)).toEqual(['orders/42/payments/open/void']);
		// #2798 thread 4341491614: what was not voided is reported, never dropped as success.
		if (result.kind !== 'voided') throw new Error(result.kind);
		expect(result.rows.map(({ id }) => id)).toEqual(['open']);
		expect(result.failed).toEqual([
			{ paymentId: 'counted', message: 'captured_refund_required', refused: true },
			{ paymentId: 'adopted', message: 'captured_refund_required', refused: true },
		]);
	});

	// #2798 thread 4341491614: a part-paid sale whose only live leg is a captured card is not a
	// clean cancel with nothing to do; the leg is reported retained and no void is sent.
	it.each(['server', 'device'] as const)(
		'a captured %s leg alone is reported retained, never voided with empty rows',
		async (capture_mode) => {
			const deps = createDeps();
			const card = { ...payment('card', 'captured'), capture_mode };

			const result = await voidPayments(order([card]), deps);

			expect(result).toEqual({
				kind: 'voided',
				via: 'offline',
				rows: [],
				failed: [{ paymentId: 'card', message: 'captured_refund_required', refused: true }],
				order: null,
			});
			expect(deps.post).not.toHaveBeenCalled();
		}
	);

	it('a string-encoded completion history still keeps its counted captured row out of a void', async () => {
		const deps = createDeps();
		deps.post.mockImplementation(async (url: string) => answered(url));
		const voidable = order([payment('counted', 'captured'), payment('open', 'captured')]);
		const history = {
			key: '_wcpos_completions',
			value: JSON.stringify([{ id: 'c1', n: 1, payment_ids: ['counted'] }]),
		};
		voidable.meta_data.push(history as never);

		await voidPayments(voidable, deps);

		expect(deps.post.mock.calls.map(([url]) => url)).toEqual(['orders/42/payments/open/void']);
	});

	it('posts each live leg in ledger order and mirrors each answered row with its summary', async () => {
		const deps = createDeps();
		const pending = payment('pending', 'pending');
		const captured = payment('captured', 'captured');
		const serverPending = { ...pending, status: 'voided' as const, updated_at_gmt: 'server-1' };
		const serverCaptured = { ...captured, status: 'voided' as const, updated_at_gmt: 'server-2' };
		const summary = {
			status: 'cancelled',
			total: '20.00',
			paid: '0.00',
			balance: '20.00',
			payment_method: '',
			payment_method_title: '',
		};
		const partly = { ...summary, status: 'pos-partial' };
		deps.post
			.mockResolvedValueOnce({ data: { payment: serverPending, order: partly } })
			.mockResolvedValueOnce({ data: { payment: serverCaptured, order: summary } });

		const result = await voidPayments(order([pending, payment('old', 'voided'), captured]), deps);

		expect(deps.post).toHaveBeenNthCalledWith(1, 'orders/42/payments/pending/void', {});
		expect(deps.post).toHaveBeenNthCalledWith(2, 'orders/42/payments/captured/void', {});
		// One mirror per answer, onto the latest ledger: never a rebuilt snapshot (ADR 0040).
		expect(deps.mirror.mock.calls).toEqual([
			[{ payment: serverPending, order: partly }],
			[{ payment: serverCaptured, order: summary }],
		]);
		expect(result).toEqual({
			kind: 'voided',
			via: 'online',
			rows: [serverPending, serverCaptured],
			failed: [],
			order: summary,
		});
	});

	it('leaves a refused row live while voiding the other rows', async () => {
		const deps = createDeps();
		const first = payment('first', 'authorized');
		const refused = payment('refused', 'captured');
		const last = payment('last', 'pending');
		const voidedFirst = { ...first, status: 'voided' as const };
		const voidedLast = { ...last, status: 'voided' as const };
		deps.post
			.mockResolvedValueOnce({ data: { payment: voidedFirst, order: { status: 'pos-partial' } } })
			.mockRejectedValueOnce({
				response: {
					status: 422,
					data: { code: 'wcpos_invalid_transition', message: 'Provider refused the void' },
				},
			})
			.mockResolvedValueOnce({ data: { payment: voidedLast, order: { status: 'pos-partial' } } });

		const result = await voidPayments(order([first, refused, last]), deps);
		if (result.kind !== 'voided') throw new Error('expected an online void');
		const written = deps.mirror.mock.calls.map(([answer]) => answer.payment);

		expect(written[0]).toEqual(voidedFirst);
		expect(written[1]).toMatchObject({ id: 'last', status: 'voided' });
		expect(written.map(({ id }: { id: string }) => id)).not.toContain('refused');
		expect(result.rows).toEqual([voidedFirst, written[1]]);
		// The store answered with a refusal, so the caller may safely tell the cashier to
		// refund this one by hand.
		expect(result.failed).toEqual([
			{ paymentId: 'refused', message: 'Provider refused the void', refused: true },
		]);
		expect(deps.mirror).toHaveBeenCalledTimes(2);
	});

	it('writes nothing when every online void fails', async () => {
		const deps = createDeps();
		deps.post.mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce({});

		const result = await voidPayments(
			order([payment('first', 'captured'), payment('second', 'authorized')]),
			deps
		);

		expect(result).toEqual({
			kind: 'voided',
			via: 'online',
			rows: [],
			failed: [
				// A bare Error is a transport failure: the store never answered, so the void
				// may yet have been applied and the caller must not promise a hand refund.
				{ paymentId: 'first', message: 'network', refused: false },
				{ paymentId: 'second', message: 'second', refused: false },
			],
			order: null,
		});
		expect(deps.mirror).not.toHaveBeenCalled();
	});

	// The journal keeps each of these for a re-send (sync-core's money answer rule): the void may
	// yet apply, so none is a refusal and the cashier is never told to refund by hand.
	it.each([
		[409, 'wcpos_payment_locked'],
		[401, 'rest_not_logged_in'],
		[403, 'rest_forbidden'],
		[408, 'request_timeout'],
		[426, 'wcpos_update_required'],
		[429, 'too_many_requests'],
		[503, 'http_service_unavailable'],
	])('a %i %s is unknown, never refused', async (status, code) => {
		const deps = createDeps();
		deps.post.mockRejectedValueOnce({ response: { status, data: { code, message: code } } });

		const result = await voidPayments(order([payment('held', 'captured')]), deps);

		expect(result).toMatchObject({
			kind: 'voided',
			failed: [{ paymentId: 'held', message: code, refused: false }],
		});
	});
});
it('cannot void an offline device authorization before it settles', async () => {
	const deps = createDeps();
	const result = await voidPayments(
		order([{ ...payment('device', 'authorized'), capture_mode: 'device', recorded_offline: true }]),
		deps
	);
	expect(result).toMatchObject({ kind: 'voided', failed: [expect.anything()] });
	expect(deps.post).not.toHaveBeenCalled();
});

// A malformed 2xx proves nothing: it is never replaced by a locally voided row (sync-core
// `isMoneyAnswer`). The leg stays live, unknown (never "refund by hand"), and journaled.
it('a malformed 2xx voids nothing locally and reports the row unknown', async () => {
	const deps = createDeps();
	deps.post.mockResolvedValue({ data: {} });

	const result = await voidPayments(order([payment('held', 'captured')]), deps);

	expect(result).toMatchObject({
		kind: 'voided',
		rows: [],
		failed: [{ paymentId: 'held', refused: false, message: 'money_command_malformed_answer' }],
	});
	expect(deps.mirror).not.toHaveBeenCalled();
});

// One poster journals every void of the sale, and a mirror settles what that poster has answered:
// each void is mirrored before the next is sent, so a settle never deletes the entry of a void
// whose row is not mirrored yet (a failed refresh or a crash would leave it live with no entry).
it('mirrors each void before sending the next one', async () => {
	const deps = createDeps();
	deps.post.mockImplementation(async (url: string) => answered(url));
	await voidPayments(order([payment('first', 'captured'), payment('second', 'captured')]), deps);
	const [firstPost, secondPost] = deps.post.mock.invocationCallOrder;
	const [firstMirror, secondMirror] = deps.mirror.mock.invocationCallOrder;
	expect(firstPost).toBeLessThan(firstMirror);
	expect(firstMirror).toBeLessThan(secondPost);
	expect(secondPost).toBeLessThan(secondMirror);
});

// A void answered with the row still live did not happen: the answer is mirrored (it is the
// store's truth, and its stored reply would replay the same) but the row is reported unknown,
// never voided, so the cashier is never told the money went back.
it('a void answered with the row still captured is mirrored and reported unknown', async () => {
	const deps = createDeps();
	const held = payment('held', 'captured');
	deps.post.mockResolvedValue({ data: { payment: held, order: { status: 'pos-partial' } } });

	const result = await voidPayments(order([held]), deps);

	expect(result).toMatchObject({
		kind: 'voided',
		rows: [],
		failed: [{ paymentId: 'held', refused: false, message: 'void_not_applied' }],
	});
	expect(deps.mirror).toHaveBeenCalledTimes(1);
});
