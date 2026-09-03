import { readLedger } from '@wcpos/order-math';
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
	patchAndEnqueue: jest.Mock;
	mirror: jest.Mock;
} {
	return {
		post: jest.fn(),
		isOnline: () => online,
		patchAndEnqueue: jest.fn(async () => undefined),
		mirror: jest.fn(async () => undefined),
		now: () => '2026-09-03T11:00:00.000Z',
	};
}

function writtenRows(write: jest.Mock): PaymentRow[] {
	return readLedger(write.mock.calls[0][0].meta_data);
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
		expect(deps.patchAndEnqueue).not.toHaveBeenCalled();
		expect(deps.mirror).not.toHaveBeenCalled();
	});

	it('voids every live leg offline and leaves terminal rows untouched', async () => {
		const deps = createDeps(false);
		const rows = [
			payment('pending', 'pending'),
			payment('voided', 'voided'),
			payment('authorized', 'authorized'),
			payment('failed', 'failed'),
			payment('captured', 'captured'),
		];

		const result = await voidPayments(order(rows), deps);
		const written = writtenRows(deps.patchAndEnqueue);

		expect(deps.patchAndEnqueue).toHaveBeenCalledTimes(1);
		expect(deps.patchAndEnqueue).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'pos-open' })
		);
		expect(written.map(({ id, status }) => ({ id, status }))).toEqual([
			{ id: 'pending', status: 'voided' },
			{ id: 'voided', status: 'voided' },
			{ id: 'authorized', status: 'voided' },
			{ id: 'failed', status: 'failed' },
			{ id: 'captured', status: 'voided' },
		]);
		expect(written[1]).toBe(rows[1]);
		expect(written[3]).toBe(rows[3]);
		expect(result).toEqual({
			kind: 'voided',
			via: 'offline',
			rows: [written[0], written[2], written[4]],
			failed: [],
			order: null,
		});
		expect(deps.post).not.toHaveBeenCalled();
		expect(deps.mirror).not.toHaveBeenCalled();
	});

	it('posts each live leg in ledger order and mirrors the last server status once', async () => {
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
		expect(deps.mirror).toHaveBeenCalledTimes(1);
		expect(writtenRows(deps.mirror)).toEqual([
			serverPending,
			payment('old', 'voided'),
			serverCaptured,
		]);
		expect(deps.mirror).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
		expect(result).toEqual({
			kind: 'voided',
			via: 'online',
			rows: [serverPending, serverCaptured],
			failed: [],
			order: summary,
		});
		expect(deps.patchAndEnqueue).not.toHaveBeenCalled();
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
		const written = writtenRows(deps.mirror);

		expect(written[0]).toEqual(voidedFirst);
		expect(written[1]).toBe(refused);
		expect(written[2]).toMatchObject({ id: 'last', status: 'voided' });
		expect(result.rows).toEqual([voidedFirst, written[2]]);
		expect(result.failed).toEqual([{ paymentId: 'refused', message: 'Provider refused the void' }]);
		expect(deps.mirror).toHaveBeenCalledTimes(1);
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
				{ paymentId: 'first', message: 'network' },
				{ paymentId: 'second', message: 'second' },
			],
			order: null,
		});
		expect(deps.patchAndEnqueue).not.toHaveBeenCalled();
		expect(deps.mirror).not.toHaveBeenCalled();
	});
});
