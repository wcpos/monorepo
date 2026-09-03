/** @jest-environment node */

import type { PaymentRow } from '@wcpos/order-math';

import { buildLedger, derivePaymentEvent } from './ledger';

const row = (overrides: Partial<PaymentRow> = {}): PaymentRow => ({
	id: 'payment-1',
	source: 'app',
	order_id: 1,
	method_id: 'cod',
	provider: null,
	kind: 'cash',
	capture_mode: 'manual',
	transport: null,
	recorded_offline: false,
	amount: '40.00',
	currency: 'EUR',
	tendered: '50.00',
	change: '10.00',
	tip: null,
	status: 'captured',
	failure_reason: null,
	refunded_amount: '0.00',
	refunds: [],
	provider_refs: {},
	receipt: {},
	cashier_id: 1,
	store_id: 1,
	created_at_gmt: '2026-09-03T10:00:00Z',
	captured_at_gmt: '2026-09-03T10:00:00Z',
	updated_at_gmt: '2026-09-03T10:00:00Z',
	...overrides,
});

describe('buildLedger', () => {
	test('formats raw totals, counts authorized rows, includes voided rows and resolves titles', () => {
		const rows = [
			row({ id: 'authorized', status: 'authorized', amount: '40.00', change: '5.00' }),
			row({ id: 'voided', method_id: 'unknown', status: 'voided', amount: '20.00' }),
		];
		const result = buildLedger(rows, 100, 'EUR', 'en-IE', new Map([['cod', 'Cash']]), 2);

		expect(result).toMatchObject({
			status: 'partial',
			total: '€100.00',
			total_raw: 100,
			paid: '€40.00',
			paid_raw: 40,
			due: '€60.00',
			due_raw: 60,
			change: '€5.00',
			change_raw: 5,
		});
		expect(result.payments).toHaveLength(2);
		expect(result.payments[0]).toMatchObject({
			method: 'Cash',
			amount: '€40.00',
			amount_raw: 40,
			tendered: '€50.00',
			tendered_raw: 50,
		});
		expect(result.payments[1]).toMatchObject({ method: 'unknown', status: 'voided' });
	});

	test.each([
		[[], 50, 'unpaid'],
		[[row({ status: 'pending' })], 50, 'unpaid'],
		[[row({ status: 'captured', amount: '20.00' })], 50, 'partial'],
		[[row({ status: 'captured', amount: '50.00' })], 50, 'paid'],
		[[row({ status: 'captured', amount: '60.00' })], 50, 'paid'],
	] as const)('derives %s rows against %s as %s', (rows, total, status) => {
		expect(buildLedger(rows, total, 'EUR', 'en-IE', new Map(), 2).status).toBe(status);
	});

	test('sums payments in minor units so an exact decimal total is paid', () => {
		const result = buildLedger(
			[
				row({ id: 'one', amount: '0.10', change: '0.10' }),
				row({ id: 'two', amount: '0.20', change: '0.20' }),
			],
			0.3,
			'EUR',
			'en-IE',
			new Map(),
			2
		);

		expect(result).toMatchObject({ status: 'paid', paid_raw: 0.3, due_raw: 0, change_raw: 0.3 });
	});

	test('does not mark an all-voided zero-total ledger as paid', () => {
		const result = buildLedger([row({ status: 'voided' })], 0, 'EUR', 'en-IE', new Map(), 2);
		expect(result.status).toBe('unpaid');
	});
});

describe('derivePaymentEvent', () => {
	const ledger = (rows: PaymentRow[], total = 100) =>
		buildLedger(rows, total, 'EUR', 'en-IE', new Map(), 2);

	test('derives started when a pending row appears', () => {
		const next = [row({ status: 'pending' })];
		expect(derivePaymentEvent([], next, 'pos-open', 'pos-open', ledger(next))).toMatchObject({
			state: 'started',
			leg: { id: 'payment-1' },
		});
	});

	test('derives approved when a row succeeds with a balance remaining', () => {
		const prev = [row({ status: 'pending' })];
		const next = [row({ status: 'authorized' })];
		expect(derivePaymentEvent(prev, next, 'pos-open', 'pos-partial', ledger(next))).toMatchObject({
			state: 'approved',
		});
	});

	test('derives declined without exposing the provider failure reason', () => {
		const prev = [row({ status: 'pending' })];
		const next = [row({ status: 'failed', failure_reason: 'gateway secret detail' })];
		const result = derivePaymentEvent(
			prev,
			next,
			'pos-open',
			'pos-open',
			ledger(next),
			'Payment declined'
		);
		expect(result).toMatchObject({ state: 'declined' });
		expect(result?.message).toBe('Payment declined');
	});

	test('omits a decline message when the caller does not supply one', () => {
		const prev = [row({ status: 'pending' })];
		const next = [row({ status: 'failed', failure_reason: 'gateway secret detail' })];
		expect(derivePaymentEvent(prev, next, 'pos-open', 'pos-open', ledger(next))).not.toHaveProperty(
			'message'
		);
	});

	test('derives complete for a captured cash-only sale', () => {
		const next = [row({ status: 'captured', amount: '100.00' })];
		expect(derivePaymentEvent([], next, 'pos-open', 'completed', ledger(next))).toMatchObject({
			state: 'complete',
		});
	});

	test('derives a newly failed leg as declined even when an earlier leg already paid the order', () => {
		const paid = row({ id: 'paid', status: 'captured', amount: '100.00' });
		const failed = row({ id: 'failed', status: 'failed', amount: '10.00' });
		const next = [paid, failed];
		expect(derivePaymentEvent([paid], next, 'pos-open', 'pos-open', ledger(next))).toMatchObject({
			state: 'declined',
			leg: { id: 'failed' },
		});
	});

	test('returns no event when rows did not change', () => {
		const rows = [row()];
		expect(
			derivePaymentEvent(
				rows,
				rows.map((item) => ({ ...item })),
				'completed',
				'completed',
				ledger(rows)
			)
		).toBeNull();
	});

	test('derives complete from an order-status transition without a row change', () => {
		const rows = [row({ id: 'captured' }), row({ id: 'pending', status: 'pending' })];
		expect(
			derivePaymentEvent(rows, rows, 'pos-open', 'completed', ledger(rows, 200))
		).toMatchObject({ state: 'complete', leg: { id: 'captured' } });
	});

	test('derives complete without a leg when an empty order becomes completed', () => {
		expect(derivePaymentEvent([], [], 'pos-open', 'completed', ledger([]))).toEqual({
			state: 'complete',
		});
	});
});
