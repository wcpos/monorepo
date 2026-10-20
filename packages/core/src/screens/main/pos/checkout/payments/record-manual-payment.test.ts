import type { PaymentMethodDescriptor, PaymentRow } from '@wcpos/order-math';

import {
	RECORD_UNKNOWN_RETRY_DELAYS_MS,
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
	register_id: null,
	session_id: null,
	created_at_gmt: NOW,
	captured_at_gmt: NOW,
	updated_at_gmt: NOW,
};

function createDeps(online = true): RecordManualPaymentDeps & {
	post: jest.Mock;
	resend: jest.Mock;
	sleep: jest.Mock;
	mirror: jest.Mock;
	raiseAttention: jest.Mock;
	fetchOrderStatus: jest.Mock;
} {
	return {
		post: jest.fn(),
		isOnline: () => online,
		cashierId: 7,
		storeId: 9,
		registerId: null,
		currency: 'EUR',
		dp: 2,
		resend: jest.fn(),
		sleep: jest.fn(async () => undefined),
		mirror: jest.fn(async () => undefined),
		fetchOrderStatus: jest.fn(async () => null),
		raiseAttention: jest.fn(),
		now: () => NOW,
		uuid: () => UUID,
	};
}

function responseError(status: number, code?: string, data: Record<string, unknown> = {}) {
	return { response: { status, data: code ? { code, message: 'Server refused', data } : data } };
}

describe('recordManualPayment', () => {
	// ADR 0040 PR A: a tender the server cannot hear is refused; PR B queues it as a command.
	it('offline is refused and nothing is written', async () => {
		const deps = createDeps(false);
		const original = structuredClone(order.meta_data);

		const result = await recordManualPayment(order, cash, { amount: 42.5, tendered: 50 }, deps);

		expect(result).toEqual({ kind: 'failed', reason: 'offline_unavailable' });
		expect(deps.post).not.toHaveBeenCalled();
		expect(deps.mirror).not.toHaveBeenCalled();
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
	});

	it.each([0, null])('refuses an order the store has not seen (server id %s)', async (id) => {
		const deps = createDeps(true);

		const result = await recordManualPayment({ ...order, id }, card, { amount: '42.50' }, deps);

		expect(result).toEqual({ kind: 'failed', reason: 'offline_unavailable' });
		expect(deps.post).not.toHaveBeenCalled();
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
		// The answered row, never a ledger rebuilt from the pre-command snapshot (ADR 0040).
		expect(deps.mirror).toHaveBeenCalledWith(
			{ payment: serverRow, status: 'completed' },
			{ accepted: true }
		);
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

		expect(deps.mirror.mock.calls[0][0].payment).toEqual(failedRow);
		expect(deps.raiseAttention).toHaveBeenCalledWith({
			row: failedRow,
			order: summary,
			reason: 'order_already_paid',
		});
		expect(result).toMatchObject({ kind: 'refused', reason: 'order_already_paid' });
	});

	it('marks the minted row failed when an already-paid refusal omits its row', async () => {
		const deps = createDeps();
		deps.post.mockRejectedValue(
			responseError(409, 'wcpos_order_already_paid', {
				order: { status: 'completed', balance: '0.00' },
			})
		);

		await recordManualPayment(order, card, { amount: '42.50' }, deps);

		expect(deps.mirror.mock.calls[0][0].payment).toEqual({
			...mintedCard,
			status: 'failed',
			failure_reason: 'order_already_paid',
		});
	});

	it('refreshes the order status when an already-paid refusal omits its summary', async () => {
		const deps = createDeps();
		deps.post.mockRejectedValue(responseError(409, 'wcpos_order_already_paid'));
		deps.fetchOrderStatus.mockResolvedValue('completed');

		const result = await recordManualPayment(order, card, { amount: '42.50' }, deps);

		// The refusal is the server saying the local copy is stale; mirroring the failed
		// row must not leave a paid order sitting at its stale status.
		expect(deps.fetchOrderStatus).toHaveBeenCalledTimes(1);
		expect(deps.mirror.mock.calls[0][0].status).toBe('completed');
		expect(result).toMatchObject({ kind: 'refused', reason: 'order_already_paid' });
	});

	it('still mirrors the refused row when the status refresh fails', async () => {
		const deps = createDeps();
		deps.post.mockRejectedValue(responseError(409, 'wcpos_order_already_paid'));
		deps.fetchOrderStatus.mockRejectedValue(new Error('offline'));

		const result = await recordManualPayment(order, card, { amount: '42.50' }, deps);

		// The money was taken: the row and the attention entry land regardless; only the
		// status is left alone because we have nothing authoritative to set it to.
		expect(deps.mirror.mock.calls[0][0].status).toBeUndefined();
		expect(deps.raiseAttention).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ kind: 'refused', reason: 'order_already_paid' });
	});

	it('does not refresh when the refusal already carries the server summary', async () => {
		const deps = createDeps();
		deps.post.mockRejectedValue(
			responseError(409, 'wcpos_order_already_paid', {
				order: { status: 'completed', balance: '0.00' },
			})
		);

		await recordManualPayment(order, card, { amount: '42.50' }, deps);

		expect(deps.fetchOrderStatus).not.toHaveBeenCalled();
		expect(deps.mirror.mock.calls[0][0].status).toBe('completed');
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
		deps.post.mockRejectedValue(
			responseError(409, 'wcpos_order_already_paid', {
				order: { status: 'completed', balance: '0.00' },
			})
		);
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
		expect(deps.mirror).not.toHaveBeenCalled();
		expect(deps.raiseAttention).not.toHaveBeenCalled();
	});

	it.each([new Error('network'), responseError(503), responseError(409, 'wcpos_payment_locked')])(
		'a 5xx re-sends the same row and body and ends unknown with the command (%p)',
		async (error) => {
			const deps = createDeps();
			deps.post.mockRejectedValue(error);
			deps.resend.mockRejectedValue(error);

			const result = await recordManualPayment(order, card, { amount: '42.50' }, deps);

			expect(deps.post).toHaveBeenCalledTimes(1);
			expect(deps.post.mock.calls[0][1].payment.id).toBe(UUID.toLowerCase());
			expect(deps.resend).toHaveBeenCalledTimes(RECORD_UNKNOWN_RETRY_DELAYS_MS.length);
			expect(deps.sleep.mock.calls).toEqual(RECORD_UNKNOWN_RETRY_DELAYS_MS.map((ms) => [ms]));
			expect(deps.mirror).not.toHaveBeenCalled();
			expect(result).toEqual({
				kind: 'unknown',
				row: expect.objectContaining({ id: UUID.toLowerCase() }),
			});
		}
	);

	it('a re-send that the store answers records the row once', async () => {
		const deps = createDeps();
		const serverRow = { ...mintedCard, status: 'captured' as const };
		deps.post.mockRejectedValue(responseError(502));
		deps.resend.mockResolvedValue({
			data: { payment: serverRow, order: { status: 'pos-partial' } },
		});

		const result = await recordManualPayment(order, card, { amount: '42.50' }, deps);

		expect(deps.resend).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ kind: 'recorded', via: 'online', row: serverRow });
		expect(deps.mirror).toHaveBeenCalledTimes(1);
	});

	it('returns invalid for card tendered input without any side effect', async () => {
		const deps = createDeps();

		const result = await recordManualPayment(order, card, { amount: '42.50', tendered: 50 }, deps);

		expect(result).toEqual({ kind: 'invalid', reason: 'tendered_not_allowed' });
		expect(deps.post).not.toHaveBeenCalled();
		expect(deps.mirror).not.toHaveBeenCalled();
		expect(deps.raiseAttention).not.toHaveBeenCalled();
	});
});

it.each(['0.00', '42.50'])(
	'persists provenance before posting the full online balance after %s paid',
	async (paid) => {
		const calls: string[] = [];
		const deps = {
			...createDeps(),
			persistProvenance: jest.fn(async () => {
				await Promise.resolve();
				calls.push('persisted');
			}),
		};
		deps.post.mockImplementation(async () => {
			calls.push('post');
			return { data: {} };
		});
		const paymentOrder = {
			...order,
			meta_data: [
				...order.meta_data,
				{
					key: '_wcpos_payments',
					value: { schema: 1, payments: [{ ...mintedCard, amount: paid }] },
				},
			],
		};

		const result = await recordManualPayment(
			paymentOrder,
			cash,
			{ amount: paid === '0.00' ? '100.00' : '57.50' },
			deps
		);

		expect(result).toMatchObject({ kind: 'recorded', via: 'online' });
		expect(calls).toEqual(['persisted', 'post']);
	}
);

it('does not persist provenance for a partial online leg', async () => {
	const deps = { ...createDeps(), persistProvenance: jest.fn(async () => undefined) };
	deps.post.mockResolvedValue({ data: {} });

	await recordManualPayment(order, cash, { amount: '42.50' }, deps);

	expect(deps.persistProvenance).not.toHaveBeenCalled();
	expect(deps.post).toHaveBeenCalledTimes(1);
});

it('returns a failed outcome without posting or enqueueing when provenance persistence throws', async () => {
	const deps = {
		...createDeps(),
		persistProvenance: jest.fn(async () => {
			throw new Error('save failed');
		}),
	};
	deps.post.mockResolvedValue({ data: {} });

	const result = await recordManualPayment(order, cash, { amount: '100.00' }, deps);

	expect(result).toEqual({ kind: 'failed', reason: 'provenance_save_failed' });
	expect(deps.post).not.toHaveBeenCalled();
	expect(deps.mirror).not.toHaveBeenCalled();
});
