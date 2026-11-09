/**
 * These fixtures pin the balance and status decisions shared with the server ledger.
 */

import {
	allowedOrderStatuses,
	availableForRefund,
	derive,
	hasRefundableMoney,
	netRefundable,
} from './derive';

import type { CaptureMode, PaymentKind, PaymentMethodDescriptor, PaymentRow } from './types';

function descriptor(
	id: string,
	title: string,
	kind: PaymentKind,
	mode: CaptureMode,
	orderStatus: string,
	change = false
): PaymentMethodDescriptor {
	return {
		schema: 1,
		id,
		title,
		kind,
		pos_enabled: true,
		order: 0,
		capture: { mode, provider: null, hardware: null, webview_available: mode === 'webview' },
		capabilities: {
			amount: { partial: true },
			change,
			refunds: { via: 'manual', partial: true },
			tips: 'none',
			offline: 'record',
			void: true,
		},
		defaults: { order_status: orderStatus, rounding: null, open_drawer: false },
		provider_data: {},
	};
}

const descriptors = [
	descriptor('pos_cash', 'Cash', 'cash', 'manual', 'completed', true),
	descriptor('stripe_terminal', 'Card', 'card', 'device', 'processing'),
	descriptor('pos_gift_card', 'Gift Card', 'stored_value', 'stored_value', 'completed'),
	descriptor('eftpos_legacy', 'EFTPOS (legacy)', 'card', 'webview', 'processing'),
];

function row(overrides: Partial<PaymentRow> = {}): PaymentRow {
	// Compact fixture plumbing preserves the explicit test-line budget.
	// prettier-ignore
	return {
		id: 'row-1', source: 'app', order_id: 1, method_id: 'pos_cash', provider: null,
		kind: 'cash', capture_mode: 'manual', transport: null, recorded_offline: false,
		amount: '0.00', currency: 'USD', tendered: null, change: null, tip: null,
		status: 'captured', failure_reason: null, refunded_amount: '0.00', refunds: [],
		provider_refs: {}, receipt: {}, cashier_id: 1, store_id: null,
		created_at_gmt: '2026-01-01T10:00:00Z',
		captured_at_gmt: '2026-01-01T10:00:00Z',
		updated_at_gmt: '2026-01-01T10:00:00Z',
		...overrides,
	};
}

describe('derive', () => {
	it('derives a settled offline cash payment and change', () => {
		const result = derive(
			'42.50',
			[row({ amount: '42.50', tendered: '50.00', recorded_offline: true })],
			descriptors
		);
		expect(result).toEqual({
			paid: '42.50',
			balance: '0.00',
			overpaid: '0.00',
			change: '7.50',
			status: 'completed',
			payment_method: 'pos_cash',
			payment_method_title: 'Cash',
			transaction_id: '',
			method_ids: ['pos_cash'],
		});
	});

	it('ignores a failed card row when a later card succeeds', () => {
		const result = derive(
			92.95,
			[
				row({
					id: 'b1',
					method_id: 'stripe_terminal',
					kind: 'card',
					amount: '92.95',
					status: 'failed',
				}),
				row({
					id: 'b2',
					method_id: 'stripe_terminal',
					kind: 'card',
					amount: '92.95',
					provider_refs: { payment_intent: 'pi_2', charge: 'ch_2' },
				}),
			],
			descriptors
		);
		expect(result.status).toBe('processing');
		expect(result.payment_method).toBe('stripe_terminal');
		expect(result.payment_method_title).toBe('Card');
		expect(result.transaction_id).toBe('pi_2');
		expect(result.method_ids).toEqual(['stripe_terminal']);
	});

	it('derives a cash and card split without counting a voided row', () => {
		const result = derive(
			'92.95',
			[
				row({
					id: 'void',
					method_id: 'stripe_terminal',
					kind: 'card',
					amount: '92.95',
					status: 'voided',
				}),
				row({ id: 'cash', amount: '50.00', tendered: '50.00' }),
				row({ id: 'card', method_id: 'stripe_terminal', kind: 'card', amount: '42.95' }),
			],
			descriptors
		);
		expect(result).toMatchObject({
			paid: '92.95',
			balance: '0.00',
			change: '0.00',
			payment_method: 'pos_cash',
			payment_method_title: 'Cash + Card',
			status: 'completed',
		});
	});

	it('excludes stored value from the primary method when another method counted', () => {
		const result = derive(
			'92.95',
			[
				row({
					id: 'gift',
					method_id: 'pos_gift_card',
					kind: 'stored_value',
					capture_mode: 'stored_value',
					amount: '60.00',
				}),
				row({ id: 'card', method_id: 'stripe_terminal', kind: 'card', amount: '32.95' }),
			],
			descriptors
		);
		expect(result).toMatchObject({
			payment_method: 'stripe_terminal',
			payment_method_title: 'Gift Card + Card',
			status: 'processing',
		});
	});

	it('falls back to stored value when it is the only counting method', () => {
		const result = derive(
			20,
			[
				row({
					method_id: 'pos_gift_card',
					kind: 'stored_value',
					capture_mode: 'stored_value',
					amount: '20.00',
				}),
			],
			descriptors
		);
		expect(result).toMatchObject({ payment_method: 'pos_gift_card', status: 'completed' });
	});

	// ADR 0040 D6: only captured money counts toward paid.
	it('a full authorization leaves the order pos-open with the balance still due', () => {
		const result = derive(18, [row({ amount: '18.00', status: 'authorized' })], descriptors);
		expect(result).toMatchObject({ paid: '0.00', balance: '18.00', status: 'pos-open' });
	});

	it('a succeeded refund on a reopened sale raises the balance and blocks completion until collected', () => {
		const refunds: PaymentRow['refunds'] = [
			{ id: 7, amount: '10.00', status: 'succeeded', provider_ref: null },
		];
		const reopened = derive(50, [row({ amount: '50.00', refunds })], descriptors);
		expect(reopened).toMatchObject({ paid: '50.00', balance: '10.00', status: 'pos-partial' });
		const collected = derive(
			50,
			[row({ id: 'a', amount: '50.00', refunds }), row({ id: 'b', amount: '10.00' })],
			descriptors
		);
		expect(collected).toMatchObject({ balance: '0.00', status: 'completed' });
	});

	it('a pending refund allocation never raises the balance', () => {
		const refunds: PaymentRow['refunds'] = [
			{ id: 8, amount: '15.00', status: 'pending', provider_ref: null },
		];
		expect(derive(50, [row({ amount: '50.00', refunds })], descriptors)).toMatchObject({
			balance: '0.00',
			status: 'completed',
		});
	});

	it('keeps a pending leg live without counting it', () => {
		const result = derive(
			50,
			[row({ method_id: 'stripe_terminal', kind: 'card', amount: '50.00', status: 'pending' })],
			descriptors
		);
		expect(result).toMatchObject({
			paid: '0.00',
			status: 'pending',
			method_ids: ['stripe_terminal'],
			payment_method: null,
			payment_method_title: '',
		});
	});

	it('marks a partly paid order as pos-partial', () => {
		expect(derive(50, [row({ amount: '20.00' })], descriptors)).toMatchObject({
			balance: '30.00',
			status: 'pos-partial',
		});
	});

	it('reports overpayment after the order total is lowered', () => {
		const result = derive(
			50,
			[row({ id: 'a', amount: '30.00' }), row({ id: 'b', amount: '30.00' })],
			descriptors
		);
		expect(result).toMatchObject({
			paid: '60.00',
			balance: '0.00',
			overpaid: '10.00',
			status: 'completed',
		});
	});

	it('breaks equal-amount ties by capture time, then ledger order, with null last', () => {
		const earlySecond = derive(
			50,
			[
				row({
					id: 'a',
					method_id: 'stripe_terminal',
					kind: 'card',
					amount: '25.00',
					captured_at_gmt: '2026-01-02T00:00:00Z',
				}),
				row({
					id: 'b',
					method_id: 'eftpos_legacy',
					kind: 'card',
					amount: '25.00',
					captured_at_gmt: '2026-01-01T00:00:00Z',
				}),
			],
			descriptors
		);
		expect(earlySecond.payment_method).toBe('eftpos_legacy');
		const equalTimes = derive(
			50,
			[
				row({ id: 'a', method_id: 'stripe_terminal', kind: 'card', amount: '25.00' }),
				row({ id: 'b', method_id: 'eftpos_legacy', kind: 'card', amount: '25.00' }),
			],
			descriptors
		);
		expect(equalTimes.payment_method).toBe('stripe_terminal');
		const nullFirst = derive(
			50,
			[
				row({
					id: 'a',
					method_id: 'stripe_terminal',
					kind: 'card',
					amount: '25.00',
					captured_at_gmt: null,
				}),
				row({ id: 'b', method_id: 'eftpos_legacy', kind: 'card', amount: '25.00' }),
			],
			descriptors
		);
		expect(nullFirst.payment_method).toBe('eftpos_legacy');
	});

	it('uses method id and completed when a descriptor is missing', () => {
		const byId = Object.fromEntries(descriptors.map((item) => [item.id, item]));
		const result = derive(10, [row({ method_id: 'ghost', amount: '10.00' })], byId);
		expect(result).toMatchObject({ payment_method_title: 'ghost', status: 'completed' });
	});

	it('uses minor-unit arithmetic and half-up input rounding', () => {
		const safe = derive(
			'30.30',
			[row({ id: 'a', amount: '10.10' }), row({ id: 'b', amount: '20.20' })],
			descriptors
		);
		expect(safe).toMatchObject({ paid: '30.30', balance: '0.00', status: 'completed' });
		const midpoint = derive('1.005', [row({ amount: '1.005' })], descriptors);
		expect(midpoint).toMatchObject({ paid: '1.01', balance: '0.00' });
		expect(derive(10, [row({ amount: 'bad' })], descriptors).paid).toBe('0.00');
	});

	it('keeps empty and non-live zero-total orders open', () => {
		expect(derive(0, [], descriptors)).toMatchObject({ status: 'pos-open', balance: '0.00' });
		expect(derive(0, [row({ amount: '10.00', status: 'voided' })], descriptors).status).toBe(
			'pos-open'
		);
	});

	it('uses the legacy transaction id for a webview row', () => {
		const result = derive(
			10,
			[
				row({
					source: 'webview',
					method_id: 'eftpos_legacy',
					kind: 'card',
					capture_mode: 'webview',
					amount: '10.00',
					provider_refs: { transaction_id: 'TXN-8812' },
				}),
			],
			descriptors
		);
		expect(result).toMatchObject({
			transaction_id: 'TXN-8812',
			payment_method_title: 'EFTPOS (legacy)',
		});
	});

	it('never throws on a malformed wire row', () => {
		const malformed = {
			...row({ amount: '10.00' }),
			provider_refs: undefined,
		} as unknown as PaymentRow;
		expect(() => derive(10, [malformed], descriptors)).not.toThrow();
		expect(derive(10, [malformed], descriptors).transaction_id).toBe('');
		expect(derive('abc', [row({ amount: 'n/a' })], descriptors)).toMatchObject({
			paid: '0.00',
			balance: '0.00',
			status: 'pos-open',
		});
	});
});

describe('allowedOrderStatuses', () => {
	const base = ['pos-open', 'pending', 'on-hold', 'cancelled'] as const;

	it('hides Cancelled while a row has refundable money', () => {
		expect(
			allowedOrderStatuses(base, 'pos-open', { total: '100', rows: [row({ amount: '10.00' })] })
		).toEqual(['pos-open', 'pending', 'on-hold']);
	});

	it('offers Cancelled after an unallocated Woo refund exhausts the captured money', () => {
		expect(
			allowedOrderStatuses(base, 'pos-open', {
				total: '100',
				refunds: [{ total: '-20' }],
				rows: [row({ amount: '20' })],
			})
		).toEqual(base);
	});

	it('keeps Cancelled when unpaid', () => {
		expect(allowedOrderStatuses(base, 'pos-open', { rows: [] })).toEqual(base);
	});

	it('keeps the current Cancelled status even when paid', () => {
		expect(
			allowedOrderStatuses(base, 'cancelled', { total: '100', rows: [row({ amount: '10.00' })] })
		).toEqual(base);
	});

	it.each(['voided', 'failed'] as const)('does not hide Cancelled for a %s row', (status) => {
		expect(
			allowedOrderStatuses(base, 'pos-open', { total: '100', rows: [row({ status })] })
		).toEqual(base);
	});

	it.each([
		['fully', '10.000001', true],
		['partially', '10.000000', false],
	] as const)(
		'offers Cancelled only after a %s refunded captured row',
		(_name, amount, allowed) => {
			const payment = row({
				amount: '10.000001',
				refunds: [{ id: 1, amount, status: 'succeeded', provider_ref: null }],
			});
			expect(
				allowedOrderStatuses(base, 'pos-open', { total: '100', rows: [payment] }).includes(
					'cancelled'
				)
			).toBe(allowed);
		}
	);
});

describe('refund availability', () => {
	it.each([
		['16.83', 16.83],
		['1.000001', 1.000001],
		['0.0000004', 0],
		['0.0000005', 0.000001],
	] as const)('returns %s in major units at server precision', (amount, expected) => {
		const payment = row({ amount });
		expect(availableForRefund(payment)).toBe(expected);
		expect(hasRefundableMoney([payment])).toBe(expected > 0);
	});

	it.each(['succeeded', 'pending'] as const)('reserves a full %s refund', (status) => {
		const payment = row({
			amount: '16.83',
			refunds: [
				{ id: 1, amount: '16.80', status, provider_ref: null },
				{ id: 2, amount: '0.03', status, provider_ref: null },
			],
		});
		expect(availableForRefund(payment)).toBe(0);
		expect(hasRefundableMoney([payment])).toBe(false);
	});

	it('offers only the remainder after succeeded and pending allocations, ignoring failed ones', () => {
		const payment = row({
			amount: '42.50',
			refunds: [
				{ id: 1, amount: '10.10', status: 'succeeded', provider_ref: null },
				{ id: 2, amount: '2.40', status: 'pending', provider_ref: null },
				{ id: 3, amount: '30.00', status: 'failed', provider_ref: null },
			],
		});
		expect(availableForRefund(payment)).toBe(30);
		expect(hasRefundableMoney([payment])).toBe(true);
	});

	it.each(['succeeded', 'pending'] as const)(
		'keeps a one-micro-unit remainder after a %s refund',
		(status) => {
			const payment = row({
				amount: '16.830001',
				refunds: [{ id: 1, amount: '16.83', status, provider_ref: null }],
			});
			expect(availableForRefund(payment)).toBe(0.000001);
			expect(hasRefundableMoney([payment])).toBe(true);
		}
	);

	it.each(['n/a', 'NaN', 'Infinity'])('treats non-finite amount %s as zero', (amount) => {
		expect(availableForRefund(row({ amount }))).toBe(0);
		expect(hasRefundableMoney([row({ amount })])).toBe(false);
		expect(
			availableForRefund(
				row({
					amount: '16.83',
					refunds: [{ id: 1, amount, status: 'pending', provider_ref: null }],
				})
			)
		).toBe(16.83);
	});

	it('never counts a voided row', () => {
		expect(hasRefundableMoney([row({ amount: '42.50', status: 'voided' })])).toBe(false);
	});

	it('clamps overallocated refunds to zero', () => {
		const payment = row({
			amount: '1',
			refunds: [{ id: 1, amount: '2', status: 'succeeded', provider_ref: null }],
		});
		expect(availableForRefund(payment)).toBe(0);
	});
});

describe('netRefundable', () => {
	it('keeps the order-total bound when the ledger holds only failed rows', () => {
		expect(
			netRefundable('100', [{ total: '-10' }], [row({ amount: '20', status: 'failed' })])
		).toBe(90);
	});

	it('subtracts an unallocated manual Woo refund from part-paid money', () => {
		expect(netRefundable('100', [{ total: '-10' }], [row({ amount: '20' })])).toBe(10);
	});

	it('does not subtract a pending provider Woo refund twice from captured money', () => {
		const payment = row({
			amount: '20',
			refunds: [{ id: 1, amount: '10', status: 'pending', provider_ref: null }],
		});
		expect(netRefundable('20', [{ total: '-10' }], [payment])).toBe(10);
	});

	it('reserves pending allocations separately from an unallocated manual Woo refund', () => {
		const payment = row({
			amount: '20',
			refunds: [{ id: 1, amount: '10', status: 'pending', provider_ref: null }],
		});
		expect(netRefundable('100', [{ total: '-10' }, { total: '-10' }], [payment])).toBe(0);
	});

	it('does not subtract an allocated Woo refund twice from part-paid money', () => {
		const payment = row({
			amount: '20',
			refunds: [{ id: 1, amount: '10', status: 'succeeded', provider_ref: null }],
		});
		expect(netRefundable('100', [{ total: '-10' }], [payment])).toBe(10);
	});

	it('nets a full Woo refund even without ledger allocations', () => {
		expect(netRefundable('16', [{ total: '-16.000000' }], [row({ amount: '16' })])).toBe(0);
		expect(netRefundable('100', [{ total: '-16.000000' }], [row({ amount: '16' })])).toBe(0);
	});

	it('nets partial Woo refunds at micro-unit precision', () => {
		expect(
			netRefundable(
				'16.830001',
				[{ total: '-10' }, { total: '-6.83' }],
				[row({ amount: '16.830001' })]
			)
		).toBe(0.000001);
	});

	it('sums available paid money when there are no Woo refunds', () => {
		expect(
			netRefundable(
				'100',
				[],
				[
					row({
						amount: '16.83',
						refunds: [{ id: 1, amount: '10', status: 'pending', provider_ref: null }],
					}),
					row({ amount: '3.17' }),
					row({ amount: '50', status: 'failed' }),
				]
			)
		).toBe(10);
	});

	it('uses absolute total minus Woo refunds when no rows exist', () => {
		expect(netRefundable('-16.83', [{ total: '-10' }, {}, { total: null }], [])).toBe(6.83);
		expect(netRefundable('16', [{ total: '-20' }], [])).toBe(0);
	});
});
