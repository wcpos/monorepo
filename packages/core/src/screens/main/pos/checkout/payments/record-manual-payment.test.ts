import type { PaymentMethodDescriptor, PaymentRow } from '@wcpos/order-math';

import {
	recordManualPayment,
	type RecordManualPaymentDeps,
	RecordManualPaymentError,
	RecordManualPaymentMirrorError,
} from './record-manual-payment';

jest.mock('uuid', () => ({ v4: () => 'unused-default-uuid' }));

const NOW = '2026-09-03T10:00:00.000Z';
const UUID = 'ABCDEF00-0000-4000-8000-000000000001';
const order = {
	uuid: 'o-1',
	id: 1042,
	number: '1042',
	total: '100.00',
	meta_data: [{ id: 5, key: '_pos_user', value: '7' }],
};
const cash = {
	schema: 1,
	id: 'pos_cash',
	title: 'Cash',
	kind: 'cash',
	pos_enabled: true,
	order: 1,
	capture: { mode: 'manual', provider: null, hardware: null, webview_available: false },
	capabilities: {
		amount: { partial: true },
		change: true,
		refunds: { via: 'manual', partial: true },
		tips: 'none',
		offline: 'record',
		void: false,
	},
	defaults: { order_status: 'completed', rounding: null, open_drawer: true },
	provider_data: {},
} satisfies PaymentMethodDescriptor;
const card = {
	...cash,
	id: 'manual_card',
	title: 'Card',
	kind: 'card',
	capture: { ...cash.capture, provider: 'stripe' },
	capabilities: { ...cash.capabilities, change: false },
} satisfies PaymentMethodDescriptor;
const mintedCard: PaymentRow = {
	id: UUID.toLowerCase(),
	source: 'app',
	order_id: 1042,
	method_id: 'manual_card',
	provider: 'stripe',
	kind: 'card',
	capture_mode: 'manual',
	transport: null,
	recorded_offline: false,
	amount: '42.50',
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
	created_at_gmt: NOW,
	captured_at_gmt: NOW,
	updated_at_gmt: NOW,
};

function createDeps(online = true): RecordManualPaymentDeps & {
	post: jest.Mock;
	patchAndEnqueue: jest.Mock;
	mirror: jest.Mock;
	raiseAttention: jest.Mock;
} {
	return {
		post: jest.fn(),
		isOnline: () => online,
		cashierId: 7,
		storeId: 9,
		currency: 'EUR',
		dp: 2,
		patchAndEnqueue: jest.fn(async () => undefined),
		mirror: jest.fn(async () => undefined),
		raiseAttention: jest.fn(),
		now: () => NOW,
		uuid: () => UUID,
	};
}

function responseError(status: number, code?: string, data: Record<string, unknown> = {}) {
	return { response: { status, data: code ? { code, message: 'Server refused', data } : data } };
}

function ledgerFrom(call: jest.Mock): { schema: number; payments: PaymentRow[] } {
	return call.mock.calls[0][0].meta_data.find(
		(entry: { key: string }) => entry.key === '_wcpos_payments'
	).value;
}

describe('recordManualPayment', () => {
	it('records cash offline and preserves existing metadata without mutating the order', async () => {
		const deps = createDeps(false);
		const original = structuredClone(order.meta_data);

		const result = await recordManualPayment(order, cash, { amount: 42.5, tendered: 50 }, deps);

		expect(deps.post).not.toHaveBeenCalled();
		expect(deps.mirror).not.toHaveBeenCalled();
		expect(deps.patchAndEnqueue).toHaveBeenCalledTimes(1);
		expect(deps.patchAndEnqueue.mock.calls[0][0].status).toBe('pos-partial');
		expect(deps.patchAndEnqueue.mock.calls[0][0].meta_data[0]).toEqual(order.meta_data[0]);
		expect(ledgerFrom(deps.patchAndEnqueue)).toEqual({
			schema: 1,
			payments: [
				expect.objectContaining({
					id: UUID.toLowerCase(),
					recorded_offline: true,
					status: 'captured',
					amount: '42.50',
					tendered: '50.00',
					change: '7.50',
				}),
			],
		});
		expect(result).toMatchObject({ kind: 'recorded', via: 'offline', order: null });
		expect(order.meta_data).toEqual(original);
	});

	it('preserves the accepted online outcome when its local mirror fails', async () => {
		const deps = createDeps();
		const serverRow = { ...mintedCard, id: 'server-payment-id' };
		const summary = { status: 'completed', balance: '0.00' };
		const mirrorFailure = new Error('resident write failed');
		deps.post.mockResolvedValue({ data: { payment: serverRow, order: summary } });
		deps.mirror.mockRejectedValue(mirrorFailure);

		const promise = recordManualPayment(order, card, { amount: '42.50' }, deps);

		await expect(promise).rejects.toBeInstanceOf(RecordManualPaymentMirrorError);
		await expect(promise).rejects.toMatchObject({
			outcome: { kind: 'recorded', via: 'online', row: serverRow, order: summary },
			cause: mirrorFailure,
		});
		expect(deps.patchAndEnqueue).not.toHaveBeenCalled();
	});

	it.each([0, null])('uses the offline path for an online order with server id %s', async (id) => {
		const deps = createDeps(true);

		await recordManualPayment({ ...order, id }, card, { amount: '42.50' }, deps);

		expect(deps.post).not.toHaveBeenCalled();
		expect(ledgerFrom(deps.patchAndEnqueue).payments[0]).toMatchObject({
			order_id: 0,
			recorded_offline: true,
		});
	});

	it('posts online and mirrors the authoritative server row and status', async () => {
		const deps = createDeps();
		const serverRow = { ...mintedCard, provider: null, updated_at_gmt: '2026-09-03T10:00:01Z' };
		const summary = {
			status: 'completed',
			total: '42.50',
			paid: '42.50',
			balance: '0.00',
			payment_method: 'manual_card',
			payment_method_title: 'Card',
		};
		deps.post.mockResolvedValue({ data: { payment: serverRow, order: summary } });

		const result = await recordManualPayment(order, card, { amount: '42.50' }, deps);

		expect(deps.post).toHaveBeenCalledWith('orders/1042/payments', { payment: mintedCard });
		expect(deps.patchAndEnqueue).not.toHaveBeenCalled();
		expect(deps.mirror).toHaveBeenCalledWith({
			meta_data: expect.arrayContaining([
				expect.objectContaining({
					key: '_wcpos_payments',
					value: { schema: 1, payments: [serverRow] },
				}),
			]),
			status: 'completed',
		});
		expect(result).toEqual({ kind: 'recorded', via: 'online', row: serverRow, order: summary });
	});

	it('mirrors and raises attention for an already-paid refusal', async () => {
		const deps = createDeps();
		const failedRow = {
			...mintedCard,
			status: 'failed' as const,
			failure_reason: 'order_already_paid',
		};
		const summary = { status: 'completed', balance: '0.00' };
		deps.post.mockRejectedValue(
			responseError(409, 'wcpos_order_already_paid', { payment: failedRow, order: summary })
		);

		const result = await recordManualPayment(order, card, { amount: '42.50' }, deps);

		expect(deps.patchAndEnqueue).not.toHaveBeenCalled();
		expect(ledgerFrom(deps.mirror).payments).toEqual([failedRow]);
		expect(deps.raiseAttention).toHaveBeenCalledWith({
			row: failedRow,
			order: summary,
			reason: 'order_already_paid',
		});
		expect(result).toMatchObject({ kind: 'refused', reason: 'order_already_paid' });
	});

	it('marks the minted row failed when an already-paid refusal omits its row', async () => {
		const deps = createDeps();
		deps.post.mockRejectedValue(responseError(409, 'wcpos_order_already_paid'));

		await recordManualPayment(order, card, { amount: '42.50' }, deps);

		expect(ledgerFrom(deps.mirror).payments[0]).toEqual({
			...mintedCard,
			status: 'failed',
			failure_reason: 'order_already_paid',
		});
	});

	it('records an amount-exceeds-balance refusal and raises attention', async () => {
		const deps = createDeps();
		deps.post.mockRejectedValue(responseError(400, 'wcpos_amount_exceeds_balance'));

		const result = await recordManualPayment(order, card, { amount: '42.50' }, deps);

		expect(deps.raiseAttention).toHaveBeenCalledWith(
			expect.objectContaining({ reason: 'amount_exceeds_balance' })
		);
		expect(result).toMatchObject({ kind: 'refused', reason: 'amount_exceeds_balance' });
	});

	it('raises refusal attention even when its local mirror fails', async () => {
		const deps = createDeps();
		const mirrorFailure = new Error('resident write failed');
		deps.post.mockRejectedValue(responseError(409, 'wcpos_order_already_paid'));
		deps.mirror.mockRejectedValue(mirrorFailure);

		const promise = recordManualPayment(order, card, { amount: '42.50' }, deps);

		await expect(promise).rejects.toBeInstanceOf(RecordManualPaymentMirrorError);
		await expect(promise).rejects.toMatchObject({
			outcome: {
				kind: 'refused',
				reason: 'order_already_paid',
				row: expect.objectContaining({ id: UUID.toLowerCase(), status: 'failed' }),
			},
			cause: mirrorFailure,
		});
		expect(deps.raiseAttention).toHaveBeenCalledWith(
			expect.objectContaining({ reason: 'order_already_paid' })
		);
	});

	it('throws a typed error for another coded 4xx without writing or attention', async () => {
		const deps = createDeps();
		deps.post.mockRejectedValue(responseError(409, 'wcpos_payment_conflict'));

		const promise = recordManualPayment(order, card, { amount: '42.50' }, deps);
		await expect(promise).rejects.toBeInstanceOf(RecordManualPaymentError);
		await expect(promise).rejects.toMatchObject({
			code: 'wcpos_payment_conflict',
			status: 409,
			message: 'Server refused',
		});
		expect(deps.patchAndEnqueue).not.toHaveBeenCalled();
		expect(deps.mirror).not.toHaveBeenCalled();
		expect(deps.raiseAttention).not.toHaveBeenCalled();
	});

	it.each([new Error('network'), responseError(503)])(
		'falls back offline with the attempted row id after %p',
		async (error) => {
			const deps = createDeps();
			deps.post.mockRejectedValue(error);

			const result = await recordManualPayment(order, card, { amount: '42.50' }, deps);

			expect(deps.post.mock.calls[0][1].payment.id).toBe(UUID.toLowerCase());
			expect(ledgerFrom(deps.patchAndEnqueue).payments[0]).toMatchObject({
				id: UUID.toLowerCase(),
				recorded_offline: true,
			});
			expect(result).toMatchObject({ kind: 'recorded', via: 'offline' });
		}
	);

	it('returns invalid for card tendered input without any side effect', async () => {
		const deps = createDeps();

		const result = await recordManualPayment(order, card, { amount: '42.50', tendered: 50 }, deps);

		expect(result).toEqual({ kind: 'invalid', reason: 'tendered_not_allowed' });
		expect(deps.post).not.toHaveBeenCalled();
		expect(deps.patchAndEnqueue).not.toHaveBeenCalled();
		expect(deps.mirror).not.toHaveBeenCalled();
		expect(deps.raiseAttention).not.toHaveBeenCalled();
	});
});
