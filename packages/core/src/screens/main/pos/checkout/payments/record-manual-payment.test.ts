import { MoneyCommandError } from '@wcpos/query';
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

/** The store's answer to a record: the row it stored and the order summary. */
const echo = async (_url: string, body: unknown) => ({
	data: { payment: (body as { payment: PaymentRow }).payment, order: { status: 'pos-partial' } },
});
function createDeps(online = true): RecordManualPaymentDeps & {
	post: jest.Mock;
	sleep: jest.Mock;
	mirror: jest.Mock;
	raiseAttention: jest.Mock;
	fetchOrderStatus: jest.Mock;
	journal: jest.Mock;
} {
	return {
		post: jest.fn(),
		journal: jest.fn(async () => undefined),
		isOnline: () => online,
		cashierId: 7,
		storeId: 9,
		registerId: null,
		currency: 'EUR',
		dp: 2,
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
	// ADR 0040 Decided 1 rules 2-3: an offline record is journaled, never posted, and the till
	// asserts the status it derives (replaces "offline is refused and nothing is written").
	it('offline journals the row, mirrors it with the derived status locally, via offline', async () => {
		const deps = createDeps(false);

		const result = await recordManualPayment(order, cash, { amount: '100.00' }, deps);

		const row = expect.objectContaining({
			id: UUID.toLowerCase(),
			method_id: 'pos_cash',
			amount: '100.00',
			recorded_offline: true,
		});
		expect(deps.journal).toHaveBeenCalledWith('orders/1042/payments', { payment: row });
		expect(deps.post).not.toHaveBeenCalled();
		expect(deps.mirror).toHaveBeenCalledWith(
			{ payment: row, status: 'completed' },
			{ accepted: true, local: true }
		);
		expect(result).toEqual({ kind: 'recorded', via: 'offline', row, order: null });
	});

	it('offline with no store id is refused, nothing journaled', async () => {
		const deps = createDeps(false);

		const result = await recordManualPayment({ ...order, id: null }, cash, { amount: 42.5 }, deps);

		expect(result).toEqual({ kind: 'failed', reason: 'offline_unavailable' });
		expect(deps.journal).not.toHaveBeenCalled();
		expect(deps.post).not.toHaveBeenCalled();
		expect(deps.mirror).not.toHaveBeenCalled();
	});

	it('offline partial leg mirrors pos-partial, no provenance', async () => {
		const deps = { ...createDeps(false), persistProvenance: jest.fn(async () => undefined) };

		const result = await recordManualPayment(order, cash, { amount: '42.50' }, deps);

		expect(deps.persistProvenance).not.toHaveBeenCalled();
		expect(deps.mirror).toHaveBeenCalledWith(
			{ payment: expect.objectContaining({ amount: '42.50' }), status: 'pos-partial' },
			{ accepted: true, local: true }
		);
		expect(result).toMatchObject({ kind: 'recorded', via: 'offline' });
	});

	it('offline completing leg persists provenance before journaling', async () => {
		const calls: string[] = [];
		const deps = {
			...createDeps(false),
			persistProvenance: jest.fn(async (options: { push: boolean }) => {
				calls.push(`persisted push=${options.push}`);
			}),
		};
		deps.journal.mockImplementation(async () => calls.push('journal'));
		deps.mirror.mockImplementation(async () => calls.push('mirror'));

		await recordManualPayment(order, cash, { amount: '100.00' }, deps);

		expect(calls).toEqual(['persisted push=false', 'journal', 'mirror']);
	});

	// Codex 4355660792 on #2865: the primary (largest) leg's method decides the derived status.
	it('an earlier larger manual-card leg configured processing, then cash offline, mirrors processing', async () => {
		const processingCard = {
			...card,
			defaults: { ...card.defaults, order_status: 'processing' },
		} satisfies PaymentMethodDescriptor;
		const earlier = { ...mintedCard, id: 'card-leg', amount: '60.00' };
		const splitOrder = {
			...order,
			meta_data: [
				...order.meta_data,
				{ key: '_wcpos_payments', value: { schema: 1, payments: [earlier] } },
			],
		};
		const deps = { ...createDeps(false), methods: [cash, processingCard] };

		await recordManualPayment(splitOrder, cash, { amount: '40.00' }, deps);

		expect(deps.mirror).toHaveBeenCalledWith(
			{ payment: expect.objectContaining({ amount: '40.00' }), status: 'processing' },
			{ accepted: true, local: true }
		);
	});

	it('offline journal/mirror failures: failed outcome / RecordManualPaymentMirrorError', async () => {
		const refused = createDeps(false);
		const cause = new Error('journal write failed');
		refused.journal.mockRejectedValue(cause);
		expect(await recordManualPayment(order, cash, { amount: '42.50' }, refused)).toEqual({
			kind: 'failed',
			reason: 'preflight_failed',
			cause,
		});
		expect(refused.mirror).not.toHaveBeenCalled();
		const inFlight = new MoneyCommandError('in_flight', { sentAt: null } as never);
		refused.journal.mockRejectedValue(inFlight);
		expect(await recordManualPayment(order, cash, { amount: '42.50' }, refused)).toMatchObject({
			kind: 'failed',
			reason: 'in_flight',
		});

		const unmirrored = createDeps(false);
		const mirrorFailure = new Error('resident write failed');
		unmirrored.mirror.mockRejectedValue(mirrorFailure);
		const promise = recordManualPayment(order, cash, { amount: '42.50' }, unmirrored);
		await expect(promise).rejects.toBeInstanceOf(RecordManualPaymentMirrorError);
		await expect(promise).rejects.toMatchObject({
			outcome: { kind: 'recorded', via: 'offline', order: null },
			cause: mirrorFailure,
		});
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

			const result = await recordManualPayment(order, card, { amount: '42.50' }, deps);

			// Every attempt is the same call; the poster re-sends the journaled record for it.
			expect(deps.post).toHaveBeenCalledTimes(RECORD_UNKNOWN_RETRY_DELAYS_MS.length + 1);
			for (const [url, body] of deps.post.mock.calls) {
				expect(url).toBe(deps.post.mock.calls[0][0]);
				expect(body).toEqual(deps.post.mock.calls[0][1]);
			}
			expect(deps.post.mock.calls[0][1].payment.id).toBe(UUID.toLowerCase());
			expect(deps.sleep.mock.calls).toEqual(RECORD_UNKNOWN_RETRY_DELAYS_MS.map((ms) => [ms]));
			expect(deps.mirror).not.toHaveBeenCalled();
			expect(result).toEqual({
				kind: 'unknown',
				row: expect.objectContaining({ id: UUID.toLowerCase() }),
			});
		}
	);

	// Codex 4342921641 on #2832: a record whose answers were all lost may be on the store. The next
	// press replays it (same row id, so the poster re-sends the same journaled command) instead of
	// minting a second payment for the same cash.
	it('a press after an unanswered record replays that row, never a new one', async () => {
		const deps = createDeps();
		let journaled: PaymentRow | null = null;
		deps.unansweredRecord = async () => journaled;
		deps.post.mockRejectedValue(new Error('network'));
		const first = await recordManualPayment(order, card, { amount: '42.50' }, deps);
		expect(first.kind).toBe('unknown');
		journaled = (first as { row: PaymentRow }).row;

		deps.post.mockReset();
		deps.post.mockImplementation(echo);
		deps.uuid = () => 'ABCDEF00-0000-4000-8000-000000000002';
		const second = await recordManualPayment(order, card, { amount: '10.00' }, deps);

		expect(deps.post).toHaveBeenCalledTimes(1);
		expect(deps.post.mock.calls[0][1]).toEqual({ payment: journaled });
		expect(second).toMatchObject({
			kind: 'recorded',
			row: { id: UUID.toLowerCase(), amount: '42.50' },
		});
	});

	it('a pre-flight failure is terminal: a typed failed outcome, never re-sent', async () => {
		const deps = createDeps();
		const refused = responseError(401, 'rest_not_logged_in');
		const entry = { sentAt: null } as never;
		deps.post.mockRejectedValue(
			new MoneyCommandError('preflight_failed', entry, undefined, { cause: refused })
		);

		const result = await recordManualPayment(order, cash, { amount: '42.50' }, deps);

		expect(result).toEqual({ kind: 'failed', reason: 'preflight_failed', cause: refused });
		expect(deps.post).toHaveBeenCalledTimes(1);
		expect(deps.sleep).not.toHaveBeenCalled();
		expect(deps.mirror).not.toHaveBeenCalled();
	});

	it.each([401, 403, 408, 426, 429])(
		'a %i is the session’s or the proxy’s answer: re-sent, never a refusal',
		async (status) => {
			const deps = createDeps();
			deps.post.mockRejectedValue(responseError(status, 'rest_forbidden'));
			const result = await recordManualPayment(order, cash, { amount: '42.50' }, deps);
			expect(result).toMatchObject({ kind: 'unknown' });
			expect(deps.post).toHaveBeenCalledTimes(RECORD_UNKNOWN_RETRY_DELAYS_MS.length + 1);
		}
	);

	it('a re-send that the store answers records the row once', async () => {
		const deps = createDeps();
		const serverRow = { ...mintedCard, status: 'captured' as const };
		deps.post.mockRejectedValueOnce(responseError(502)).mockResolvedValueOnce({
			data: { payment: serverRow, order: { status: 'pos-partial' } },
		});

		const result = await recordManualPayment(order, card, { amount: '42.50' }, deps);

		expect(deps.post).toHaveBeenCalledTimes(2);
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
		deps.post.mockImplementation(async (_url: string, body: unknown) => {
			calls.push('post');
			return echo('', body);
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
	deps.post.mockImplementation(echo);

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
	deps.post.mockImplementation(echo);

	const result = await recordManualPayment(order, cash, { amount: '100.00' }, deps);

	expect(result).toEqual({ kind: 'failed', reason: 'provenance_save_failed' });
	expect(deps.post).not.toHaveBeenCalled();
	expect(deps.mirror).not.toHaveBeenCalled();
});

// A malformed 2xx proves nothing: it is never replaced by the minted row (sync-core
// `isMoneyAnswer`). It is re-sent like no answer, then ends unknown with the command journaled.
it('a malformed 2xx records nothing locally and ends unknown after its re-sends', async () => {
	const deps = createDeps();
	deps.post.mockResolvedValue({ data: {} });

	const result = await recordManualPayment(order, cash, { amount: '42.50' }, deps);

	expect(result).toMatchObject({ kind: 'unknown' });
	expect(deps.post).toHaveBeenCalledTimes(4);
	expect(deps.mirror).not.toHaveBeenCalled();
});
