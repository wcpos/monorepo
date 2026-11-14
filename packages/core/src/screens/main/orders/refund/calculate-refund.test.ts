import type { PaymentRow } from '@wcpos/order-math';

import * as refundCalc from './calculate-refund';
import {
	calculateLineItemRefund,
	calculateRefundTotal,
	computeMaxRefundable,
	computeRemainingRefundQuantity,
	formatRefundUnitPrice,
} from './calculate-refund';

describe('calculateLineItemRefund', () => {
	it('calculates proportional refund for a single unit', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '30.00',
			taxes: [{ id: 1, total: '6.00' }],
			refundQty: 1,
		});

		expect(result.refund_total).toBe('10.00');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '2.00' }]);
	});

	it('calculates full refund when refundQty equals quantity', () => {
		const result = calculateLineItemRefund({
			quantity: 2,
			total: '25.50',
			taxes: [{ id: 1, total: '5.10' }],
			refundQty: 2,
		});

		expect(result.refund_total).toBe('25.50');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '5.10' }]);
	});

	it('returns zeros when refundQty is 0', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '30.00',
			taxes: [{ id: 1, total: '6.00' }],
			refundQty: 0,
		});

		expect(result.refund_total).toBe('0.00');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '0.00' }]);
	});

	it('handles multiple tax rates', () => {
		const result = calculateLineItemRefund({
			quantity: 2,
			total: '20.00',
			taxes: [
				{ id: 1, total: '3.00' },
				{ id: 2, total: '1.00' },
			],
			refundQty: 1,
		});

		expect(result.refund_total).toBe('10.00');
		expect(result.refund_tax).toEqual([
			{ id: 1, refund_total: '1.50' },
			{ id: 2, refund_total: '0.50' },
		]);
	});

	it('clamps refundQty exceeding quantity to full refund', () => {
		const result = calculateLineItemRefund({
			quantity: 2,
			total: '20.00',
			taxes: [{ id: 1, total: '4.00' }],
			refundQty: 5,
		});

		expect(result.refund_total).toBe('20.00');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '4.00' }]);
	});

	it('clamps negative refundQty to zero', () => {
		const result = calculateLineItemRefund({
			quantity: 2,
			total: '20.00',
			taxes: [{ id: 1, total: '4.00' }],
			refundQty: -3,
		});

		expect(result.refund_total).toBe('0.00');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '0.00' }]);
	});

	it('handles zero tax', () => {
		const result = calculateLineItemRefund({
			quantity: 2,
			total: '20.00',
			taxes: [],
			refundQty: 1,
		});

		expect(result.refund_total).toBe('10.00');
		expect(result.refund_tax).toEqual([]);
	});
});

describe('calculateRefundTotal', () => {
	it('sums line item refunds and custom amount', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [
				{
					refund_total: '10.00',
					refund_tax: [{ id: 1, refund_total: '2.00' }],
				},
				{ refund_total: '5.00', refund_tax: [{ id: 1, refund_total: '1.00' }] },
			],
			customAmount: '3.00',
		});

		expect(result).toBe('21.00');
	});
});

describe('calculateLineItemRefund with dp parameter', () => {
	it('dp=0: rounds to whole numbers (JPY)', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '3000',
			taxes: [{ id: 1, total: '300' }],
			refundQty: 1,
			dp: 0,
		});
		expect(result.refund_total).toBe('1000');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '100' }]);
	});

	it('dp=0: rounding with HALF_UP (JPY)', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '1000',
			taxes: [],
			refundQty: 1,
			dp: 0,
		});
		expect(result.refund_total).toBe('333');
	});

	it('dp=0: zero refund returns "0" not "0.00"', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '3000',
			taxes: [{ id: 1, total: '300' }],
			refundQty: 0,
			dp: 0,
		});
		expect(result.refund_total).toBe('0');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '0' }]);
	});

	it('dp=3: three decimal places (KWD)', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '30.000',
			taxes: [{ id: 1, total: '6.000' }],
			refundQty: 1,
			dp: 3,
		});
		expect(result.refund_total).toBe('10.000');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '2.000' }]);
	});

	it('dp=3: rounding at third decimal (KWD)', () => {
		const result = calculateLineItemRefund({
			quantity: 7,
			total: '10.000',
			taxes: [],
			refundQty: 1,
			dp: 3,
		});
		expect(result.refund_total).toBe('1.429');
	});

	it('dp defaults to 2 when not provided (backward compat)', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '10.00',
			taxes: [],
			refundQty: 1,
		});
		expect(result.refund_total).toBe('3.33');
	});
});

describe('calculateRefundTotal with dp parameter', () => {
	it('dp=0: sums to whole number (JPY)', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [{ refund_total: '1000', refund_tax: [{ id: 1, refund_total: '100' }] }],
			customAmount: '500',
			dp: 0,
		});
		expect(result).toBe('1600');
	});

	it('dp=3: sums to three decimal places (KWD)', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [
				{
					refund_total: '10.000',
					refund_tax: [{ id: 1, refund_total: '2.000' }],
				},
			],
			customAmount: '3.000',
			dp: 3,
		});
		expect(result).toBe('15.000');
	});

	it('dp=0: empty inputs returns "0"', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [],
			customAmount: '',
			dp: 0,
		});
		expect(result).toBe('0');
	});
});

describe('computeMaxRefundable', () => {
	const captured: PaymentRow = {
		id: 'payment-1',
		source: 'app',
		order_id: 1,
		method_id: 'pos_cash',
		provider: null,
		kind: 'cash',
		capture_mode: 'manual',
		transport: null,
		recorded_offline: false,
		amount: '20.00',
		currency: 'USD',
		tendered: null,
		change: null,
		tip: null,
		status: 'captured',
		failure_reason: null,
		refunded_amount: '0.00',
		refunds: [],
		provider_refs: {},
		receipt: {},
		cashier_id: 1,
		store_id: null,
		created_at_gmt: '2026-01-01T00:00:00Z',
		captured_at_gmt: '2026-01-01T00:00:00Z',
		updated_at_gmt: '2026-01-01T00:00:00Z',
	};

	it.each([
		['-16.83', [], -16.83],
		['', [{}], 0],
		['16', [{ total: '-20' }], -4],
	] as const)('preserves legacy handling of total %s without rows', (total, refunds, expected) => {
		expect(computeMaxRefundable(total, [...refunds], 2, [])).toBe(expected);
	});

	it('nets Woo refunds without allocations and clamps the ledger maximum at zero', () => {
		expect(computeMaxRefundable('20', [{ total: '-20' }], 2, [captured])).toBe(0);
		expect(computeMaxRefundable('20', [{ total: '-10' }], 2, [captured])).toBe(10);
		expect(computeMaxRefundable('20', [{ total: '-21' }], 2, [captured])).toBe(0);
	});

	it('caps a part-paid order at the captured amount', () => {
		expect(computeMaxRefundable('100.00', [], 2, [captured])).toBe(20);
	});

	it.each([
		['5.00', 15],
		['20.00', 0],
	] as const)('subtracts a succeeded allocation of %s from captured money', (amount, expected) => {
		const payment = {
			...captured,
			refunds: [{ id: 1, amount, status: 'succeeded' as const, provider_ref: null }],
		};
		expect(computeMaxRefundable('100.00', [{ total: `-${amount}` }], 2, [payment])).toBe(expected);
	});

	it('keeps total minus previous refunds when no ledger rows exist', () => {
		expect(computeMaxRefundable('100.00', [{ total: '-5.00' }], 2, [])).toBe(95);
	});

	it('exhausts captured money when unallocated Woo refunds exceed it', () => {
		expect(computeMaxRefundable('100.00', [{ total: '-90.00' }], 2, [captured])).toBe(0);
	});

	it('sums paid rows without counting failed payments', () => {
		expect(
			computeMaxRefundable('100.00', [], 2, [
				captured,
				{ ...captured, id: 'payment-2' },
				{ ...captured, id: 'payment-3', status: 'failed' },
			])
		).toBe(40);
	});

	it('dp=0: whole number currency (JPY)', () => {
		expect(computeMaxRefundable('10000', [], 0)).toBe(10000);
	});

	it('dp=0: with previous refund (JPY)', () => {
		expect(computeMaxRefundable('10000', [{ total: '-3000' }], 0)).toBe(7000);
	});

	it('dp=3: three decimal places (KWD)', () => {
		expect(computeMaxRefundable('100.000', [{ total: '-30.000' }], 3)).toBe(70.0);
	});
});

describe('formatLineItemRefundWithTax', () => {
	it('uses half-up rounding for display totals', () => {
		expect(typeof refundCalc.formatLineItemRefundWithTax).toBe('function');
		expect(
			refundCalc.formatLineItemRefundWithTax(
				{
					refund_total: '0.335',
					refund_tax: [{ id: 1, refund_total: '0.670' }],
				},
				2
			)
		).toBe('1.01');
	});
});

describe('formatRefundUnitPrice', () => {
	it('includes tax when cart prices are displayed including tax', () => {
		expect(
			formatRefundUnitPrice({
				quantity: 2,
				total: '40.00',
				totalTax: '8.00',
				displayTax: 'incl',
				dp: 2,
			})
		).toBe('24.00');
	});

	it('excludes tax when cart prices are displayed excluding tax', () => {
		expect(
			formatRefundUnitPrice({
				quantity: 2,
				total: '40.00',
				totalTax: '8.00',
				displayTax: 'excl',
				dp: 2,
			})
		).toBe('20.00');
	});
});

describe('computeRemainingRefundQuantity', () => {
	it('subtracts previously refunded quantities for the same line item', () => {
		expect(
			computeRemainingRefundQuantity({
				lineItemId: 123,
				quantity: 2,
				refunds: [
					{
						line_items: [{ id: 123, quantity: 1 }],
					},
				],
			})
		).toBe(1);
	});

	it('never returns a negative remaining quantity', () => {
		expect(
			computeRemainingRefundQuantity({
				lineItemId: 123,
				quantity: 1,
				refunds: [{ line_items: [{ item_id: 123, quantity: 3 }] }],
			})
		).toBe(0);
	});

	it('uses WooCommerce refunded item metadata when refund line id differs from original item id', () => {
		expect(
			computeRemainingRefundQuantity({
				lineItemId: 123,
				quantity: 2,
				refunds: [
					{
						line_items: [
							{
								id: 999,
								quantity: 1,
								meta_data: [{ key: '_refunded_item_id', value: '123' }],
							},
						],
					},
				],
			})
		).toBe(1);
	});

	it('prefers explicit item_id over refund line id', () => {
		expect(
			computeRemainingRefundQuantity({
				lineItemId: 123,
				quantity: 2,
				refunds: [{ line_items: [{ id: 999, item_id: 123, quantity: 1 }] }],
			})
		).toBe(1);
	});
});
