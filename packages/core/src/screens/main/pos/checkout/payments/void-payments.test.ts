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
		now: () => '2026-09-03T11:00:00.000Z',
	};
}

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

	// ADR 0040 PR A: a void the server cannot hear is refused; nothing is voided locally.
	it('offline voids nothing and reports every row refused', async () => {
		const deps = createDeps(false);
		const rows = [
			payment('pending', 'pending'),
			payment('voided', 'voided'),
			payment('authorized', 'authorized'),
			payment('captured', 'captured'),
		];

		const result = await voidPayments(order(rows), deps);

		expect(result).toEqual({
			kind: 'voided',
			via: 'offline',
			rows: [],
			failed: ['pending', 'authorized', 'captured'].map((paymentId) => ({
				paymentId,
				message: 'offline_unavailable',
				refused: true,
			})),
			order: null,
		});
		expect(deps.post).not.toHaveBeenCalled();
		expect(deps.mirror).not.toHaveBeenCalled();
	});

	it('a captured row counted in a completion, or an adopted woocommerce tender, is not sent to void', async () => {
		const deps = createDeps();
		deps.post.mockResolvedValue({ data: {} });
		const counted = payment('counted', 'captured');
		const adopted = { ...payment('adopted', 'captured'), capture_mode: 'server' as const };
		const open = payment('open', 'captured');
		const voidable = order([counted, adopted, open]);
		const history = { key: '_wcpos_completions', value: [{ payment_ids: ['counted'] }] };
		voidable.meta_data.push(history as never);

		await voidPayments(voidable, deps);

		expect(deps.post.mock.calls.map(([url]) => url)).toEqual(['orders/42/payments/open/void']);
	});

	it('a string-encoded completion history still keeps its counted captured row out of a void', async () => {
		const deps = createDeps();
		deps.post.mockResolvedValue({ data: {} });
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
		deps.post
			.mockResolvedValueOnce({ data: { payment: serverPending } })
			.mockResolvedValueOnce({ data: { payment: serverCaptured, order: summary } });

		const result = await voidPayments(order([pending, payment('old', 'voided'), captured]), deps);

		expect(deps.post).toHaveBeenNthCalledWith(1, 'orders/42/payments/pending/void', {});
		expect(deps.post).toHaveBeenNthCalledWith(2, 'orders/42/payments/captured/void', {});
		// One mirror per answer, onto the latest ledger: never a rebuilt snapshot (ADR 0040).
		expect(deps.mirror.mock.calls).toEqual([
			[{ payment: serverPending, order: null }],
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
		deps.post
			.mockResolvedValueOnce({ data: { payment: voidedFirst } })
			.mockRejectedValueOnce({ response: { data: { message: 'Provider refused the void' } } })
			.mockResolvedValueOnce({ data: {} });

		const result = await voidPayments(order([first, refused, last]), deps);
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
});
it('cannot void an offline device authorization before it settles', async () => {
	const deps = createDeps();
	const result = await voidPayments(
		order([{ ...payment('device', 'authorized'), capture_mode: 'device', recorded_offline: true }]),
		deps
	);
	expect(result.failed).toHaveLength(1);
	expect(deps.post).not.toHaveBeenCalled();
});
