/**
 * @jest-environment node
 *
 * WooCommerce Refund Calculation Parity Tests
 *
 * These tests verify that our JavaScript refund calculations match
 * WooCommerce's server-side behavior when processing refunds via
 * the REST API (POST /orders/{id}/refunds).
 *
 * Sources:
 * - includes/wc-order-functions.php (wc_create_refund)
 * - includes/class-wc-order-item.php (set_quantity, calculate amounts)
 * - REST: includes/rest-api/Controllers/Version3/class-wc-rest-order-refunds-controller.php
 *
 * Key behavioral notes from WooCommerce:
 * - wc_create_refund() accepts a top-level `amount` and optional `line_items`
 * - PHP uses round($value, wc_get_price_decimals()) with PHP_ROUND_HALF_UP by default
 * - When line_items are provided, WC trusts the amounts we send — it does NOT recalculate
 * - The `amount` field is authoritative; WC validates amount <= remaining refundable
 * - Refund amounts stored as negative in WC but our API sends positive
 * - Tax refund is per-tax-rate, not a single total
 */
import {
	calculateLineItemRefund,
	calculateRefundTotal,
	computeMaxRefundable,
} from './calculate-refund';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestLineItem {
	quantity: number;
	total: string;
	taxes: { id: number; total: string }[];
	refundQty: number;
}

const createLineItem = (overrides: Partial<TestLineItem> = {}): TestLineItem => ({
	quantity: 1,
	total: '10.00',
	taxes: [],
	refundQty: 0,
	...overrides,
});

// ---------------------------------------------------------------------------
// A. Proportional Line Item Refund — Clean Divisions
// ---------------------------------------------------------------------------

describe('A. Proportional refund — clean divisions', () => {
	const cases = [
		{
			description: '1 of 3 from $30.00 with single tax',
			input: createLineItem({
				quantity: 3,
				total: '30.00',
				taxes: [{ id: 1, total: '6.00' }],
				refundQty: 1,
			}),
			expected: {
				refund_total: '10.00',
				refund_tax: [{ id: 1, refund_total: '2.00' }],
			},
		},
		{
			description: '2 of 4 from $40.00, no tax',
			input: createLineItem({
				quantity: 4,
				total: '40.00',
				taxes: [],
				refundQty: 2,
			}),
			expected: { refund_total: '20.00', refund_tax: [] },
		},
		{
			description: 'full refund (refundQty = quantity)',
			input: createLineItem({
				quantity: 2,
				total: '25.50',
				taxes: [{ id: 1, total: '5.10' }],
				refundQty: 2,
			}),
			expected: {
				refund_total: '25.50',
				refund_tax: [{ id: 1, refund_total: '5.10' }],
			},
		},
		{
			description: 'single-unit order, full refund',
			input: createLineItem({
				quantity: 1,
				total: '99.99',
				taxes: [{ id: 1, total: '10.00' }],
				refundQty: 1,
			}),
			expected: {
				refund_total: '99.99',
				refund_tax: [{ id: 1, refund_total: '10.00' }],
			},
		},
		{
			description: 'exact half: 3 of 6 from $60.00',
			input: createLineItem({
				quantity: 6,
				total: '60.00',
				taxes: [{ id: 1, total: '12.00' }],
				refundQty: 3,
			}),
			expected: {
				refund_total: '30.00',
				refund_tax: [{ id: 1, refund_total: '6.00' }],
			},
		},
		{
			description: 'high-quantity clean split: 10 of 100 from $1000.00',
			input: createLineItem({
				quantity: 100,
				total: '1000.00',
				taxes: [],
				refundQty: 10,
			}),
			expected: { refund_total: '100.00', refund_tax: [] },
		},
		{
			description: 'zero-tax item',
			input: createLineItem({
				quantity: 2,
				total: '20.00',
				taxes: [],
				refundQty: 1,
			}),
			expected: { refund_total: '10.00', refund_tax: [] },
		},
		{
			description: 'multiple tax rates, clean split',
			input: createLineItem({
				quantity: 2,
				total: '20.00',
				taxes: [
					{ id: 1, total: '3.00' },
					{ id: 2, total: '1.00' },
				],
				refundQty: 1,
			}),
			expected: {
				refund_total: '10.00',
				refund_tax: [
					{ id: 1, refund_total: '1.50' },
					{ id: 2, refund_total: '0.50' },
				],
			},
		},
	];

	it.each(cases)('$description', ({ input, expected }) => {
		expect(calculateLineItemRefund(input)).toEqual(expected);
	});
});

// ---------------------------------------------------------------------------
// B. Rounding / Fractional Penny — Parity Critical
//
// These cases target the divergence between JS toFixed(2) (banker's rounding)
// and PHP round() (HALF_UP). Our code should match PHP's behavior.
// ---------------------------------------------------------------------------

describe('B. Rounding — WooCommerce parity (PHP HALF_UP)', () => {
	const cases = [
		{
			description: '1 of 3 from $10.00 → 3.333... → "3.33"',
			input: createLineItem({
				quantity: 3,
				total: '10.00',
				taxes: [],
				refundQty: 1,
			}),
			expected: { refund_total: '3.33', refund_tax: [] },
		},
		{
			description: '2 of 3 from $10.00 → 6.666... → "6.67"',
			input: createLineItem({
				quantity: 3,
				total: '10.00',
				taxes: [],
				refundQty: 2,
			}),
			expected: { refund_total: '6.67', refund_tax: [] },
		},
		{
			description: '1 of 3 from $20.00 → 6.666... → "6.67"',
			input: createLineItem({
				quantity: 3,
				total: '20.00',
				taxes: [],
				refundQty: 1,
			}),
			expected: { refund_total: '6.67', refund_tax: [] },
		},
		{
			description: '1 of 6 from $10.00 → 1.666... → "1.67"',
			input: createLineItem({
				quantity: 6,
				total: '10.00',
				taxes: [],
				refundQty: 1,
			}),
			expected: { refund_total: '1.67', refund_tax: [] },
		},
		{
			description: '1 of 7 from $10.00 → 1.42857... → "1.43"',
			input: createLineItem({
				quantity: 7,
				total: '10.00',
				taxes: [],
				refundQty: 1,
			}),
			expected: { refund_total: '1.43', refund_tax: [] },
		},
		{
			description: 'tax midpoint: 1 of 3 from tax $5.00 → 1.666... → "1.67"',
			input: createLineItem({
				quantity: 3,
				total: '30.00',
				taxes: [{ id: 1, total: '5.00' }],
				refundQty: 1,
			}),
			expected: {
				refund_total: '10.00',
				refund_tax: [{ id: 1, refund_total: '1.67' }],
			},
		},
		{
			// 10.70 * 0.25 = 2.675 exactly — PHP HALF_UP → 2.68, JS toFixed → 2.67
			description: 'midpoint: qty=4 total="10.70" refundQty=1 → 2.675 → "2.68" (PHP HALF_UP)',
			input: createLineItem({
				quantity: 4,
				total: '10.70',
				taxes: [],
				refundQty: 1,
			}),
			expected: { refund_total: '2.68', refund_tax: [] },
		},
		{
			// 7.10 * 0.75 = 5.3249999... in IEEE 754 (not a true midpoint) → 5.32
			description: 'near-midpoint: qty=4 total="7.10" refundQty=3 → 5.3249... → "5.32"',
			input: createLineItem({
				quantity: 4,
				total: '7.10',
				taxes: [],
				refundQty: 3,
			}),
			expected: { refund_total: '5.32', refund_tax: [] },
		},
		{
			// tax midpoint: 10.70 * 0.25 = 2.675
			description: 'tax midpoint: qty=4 tax="10.70" refundQty=1 → tax "2.68" (PHP HALF_UP)',
			input: createLineItem({
				quantity: 4,
				total: '40.00',
				taxes: [{ id: 1, total: '10.70' }],
				refundQty: 1,
			}),
			expected: {
				refund_total: '10.00',
				refund_tax: [{ id: 1, refund_total: '2.68' }],
			},
		},
		{
			description: 'tiny fraction: 1 of 3 from $0.01 → 0.00333... → "0.00"',
			input: createLineItem({
				quantity: 3,
				total: '0.01',
				taxes: [],
				refundQty: 1,
			}),
			expected: { refund_total: '0.00', refund_tax: [] },
		},
		{
			description: 'tiny fraction: 1 of 3 from $0.02 → 0.00666... → "0.01"',
			input: createLineItem({
				quantity: 3,
				total: '0.02',
				taxes: [],
				refundQty: 1,
			}),
			expected: { refund_total: '0.01', refund_tax: [] },
		},
	];

	it.each(cases)('$description', ({ input, expected }) => {
		expect(calculateLineItemRefund(input)).toEqual(expected);
	});
});

// ---------------------------------------------------------------------------
// C. Clamping and Boundary
// ---------------------------------------------------------------------------

describe('C. Clamping and boundary', () => {
	it('clamps refundQty exceeding quantity to full refund', () => {
		const result = calculateLineItemRefund(
			createLineItem({
				quantity: 2,
				total: '20.00',
				taxes: [{ id: 1, total: '4.00' }],
				refundQty: 5,
			})
		);
		expect(result.refund_total).toBe('20.00');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '4.00' }]);
	});

	it('clamps negative refundQty to zero', () => {
		const result = calculateLineItemRefund(
			createLineItem({
				quantity: 2,
				total: '20.00',
				taxes: [{ id: 1, total: '4.00' }],
				refundQty: -3,
			})
		);
		expect(result.refund_total).toBe('0.00');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '0.00' }]);
	});

	it('returns zeros when refundQty is 0', () => {
		const result = calculateLineItemRefund(
			createLineItem({ quantity: 2, total: '20.00', taxes: [], refundQty: 0 })
		);
		expect(result.refund_total).toBe('0.00');
	});

	it('returns zeros when quantity is 0', () => {
		const result = calculateLineItemRefund(
			createLineItem({ quantity: 0, total: '0.00', taxes: [], refundQty: 0 })
		);
		expect(result.refund_total).toBe('0.00');
	});

	it('handles quantity=0 with refundQty>0 (clamps to 0)', () => {
		const result = calculateLineItemRefund(
			createLineItem({ quantity: 0, total: '10.00', taxes: [], refundQty: 1 })
		);
		expect(result.refund_total).toBe('0.00');
	});

	it('single penny full refund', () => {
		const result = calculateLineItemRefund(
			createLineItem({ quantity: 1, total: '0.01', taxes: [], refundQty: 1 })
		);
		expect(result.refund_total).toBe('0.01');
	});
});

// ---------------------------------------------------------------------------
// D. Zero / Empty / Degenerate Inputs
// ---------------------------------------------------------------------------

describe('D. Zero / empty / degenerate inputs', () => {
	it('item with zero total', () => {
		const result = calculateLineItemRefund(
			createLineItem({ quantity: 2, total: '0.00', taxes: [], refundQty: 1 })
		);
		expect(result.refund_total).toBe('0.00');
	});

	it('zero total but non-zero tax', () => {
		const result = calculateLineItemRefund(
			createLineItem({
				quantity: 2,
				total: '0.00',
				taxes: [{ id: 1, total: '2.00' }],
				refundQty: 1,
			})
		);
		expect(result.refund_total).toBe('0.00');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '1.00' }]);
	});

	it('empty taxes array', () => {
		const result = calculateLineItemRefund(
			createLineItem({ quantity: 2, total: '20.00', taxes: [], refundQty: 1 })
		);
		expect(result.refund_tax).toEqual([]);
	});

	it('negative total string', () => {
		const result = calculateLineItemRefund(
			createLineItem({ quantity: 2, total: '-20.00', taxes: [], refundQty: 1 })
		);
		expect(result.refund_total).toBe('-10.00');
	});

	it('large total', () => {
		const result = calculateLineItemRefund(
			createLineItem({
				quantity: 1,
				total: '999999.99',
				taxes: [],
				refundQty: 1,
			})
		);
		expect(result.refund_total).toBe('999999.99');
	});
});

// ---------------------------------------------------------------------------
// E. Multiple Tax Rates
// ---------------------------------------------------------------------------

describe('E. Multiple tax rates', () => {
	it('two rates, clean split', () => {
		const result = calculateLineItemRefund(
			createLineItem({
				quantity: 2,
				total: '20.00',
				taxes: [
					{ id: 1, total: '6.00' },
					{ id: 2, total: '2.00' },
				],
				refundQty: 1,
			})
		);
		expect(result.refund_tax).toEqual([
			{ id: 1, refund_total: '3.00' },
			{ id: 2, refund_total: '1.00' },
		]);
	});

	it('three rates, uneven amounts', () => {
		const result = calculateLineItemRefund(
			createLineItem({
				quantity: 3,
				total: '30.00',
				taxes: [
					{ id: 1, total: '7.00' },
					{ id: 2, total: '3.50' },
					{ id: 3, total: '1.25' },
				],
				refundQty: 1,
			})
		);
		expect(result.refund_tax).toEqual([
			{ id: 1, refund_total: '2.33' },
			{ id: 2, refund_total: '1.17' },
			{ id: 3, refund_total: '0.42' },
		]);
	});

	it('tax rate with zero total', () => {
		const result = calculateLineItemRefund(
			createLineItem({
				quantity: 2,
				total: '20.00',
				taxes: [
					{ id: 1, total: '4.00' },
					{ id: 2, total: '0.00' },
				],
				refundQty: 1,
			})
		);
		expect(result.refund_tax).toEqual([
			{ id: 1, refund_total: '2.00' },
			{ id: 2, refund_total: '0.00' },
		]);
	});

	it('five tax rates, sum accuracy', () => {
		const result = calculateLineItemRefund(
			createLineItem({
				quantity: 4,
				total: '100.00',
				taxes: [
					{ id: 1, total: '10.00' },
					{ id: 2, total: '5.00' },
					{ id: 3, total: '4.00' },
					{ id: 4, total: '3.00' },
					{ id: 5, total: '3.00' },
				],
				refundQty: 1,
			})
		);
		expect(result.refund_total).toBe('25.00');
		expect(result.refund_tax).toEqual([
			{ id: 1, refund_total: '2.50' },
			{ id: 2, refund_total: '1.25' },
			{ id: 3, refund_total: '1.00' },
			{ id: 4, refund_total: '0.75' },
			{ id: 5, refund_total: '0.75' },
		]);
	});

	it('two tax rates with midpoint rounding', () => {
		const result = calculateLineItemRefund(
			createLineItem({
				quantity: 4,
				total: '40.00',
				taxes: [
					{ id: 1, total: '10.70' },
					{ id: 2, total: '5.30' },
				],
				refundQty: 1,
			})
		);
		// 10.70 * 0.25 = 2.675 → PHP HALF_UP → 2.68
		// 5.30 * 0.25 = 1.325 → PHP HALF_UP → 1.33
		expect(result.refund_tax).toEqual([
			{ id: 1, refund_total: '2.68' },
			{ id: 2, refund_total: '1.33' },
		]);
	});
});

// ---------------------------------------------------------------------------
// F. calculateRefundTotal — Summation
// ---------------------------------------------------------------------------

describe('F. calculateRefundTotal summation', () => {
	it('single item, no custom amount', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [
				{
					refund_total: '10.00',
					refund_tax: [{ id: 1, refund_total: '2.00' }],
				},
			],
			customAmount: '',
		});
		expect(result).toBe('12.00');
	});

	it('multiple items, no custom amount', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [
				{
					refund_total: '10.00',
					refund_tax: [{ id: 1, refund_total: '2.00' }],
				},
				{ refund_total: '5.00', refund_tax: [{ id: 1, refund_total: '1.00' }] },
			],
			customAmount: '',
		});
		expect(result).toBe('18.00');
	});

	it('custom amount only, no line items', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [],
			customAmount: '7.50',
		});
		expect(result).toBe('7.50');
	});

	it('line items + custom amount combined', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [
				{
					refund_total: '10.00',
					refund_tax: [{ id: 1, refund_total: '2.00' }],
				},
			],
			customAmount: '3.00',
		});
		expect(result).toBe('15.00');
	});

	it('empty inputs', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [],
			customAmount: '',
		});
		expect(result).toBe('0.00');
	});

	it('custom amount "0"', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [],
			customAmount: '0',
		});
		expect(result).toBe('0.00');
	});

	it('floating-point accumulation stress: many fractional amounts', () => {
		// 7 items each with refund_total "1.11" and tax "0.22"
		// Total should be 7 * (1.11 + 0.22) = 7 * 1.33 = 9.31
		const lineItemRefunds = Array.from({ length: 7 }, () => ({
			refund_total: '1.11',
			refund_tax: [{ id: 1, refund_total: '0.22' }],
		}));
		const result = calculateRefundTotal({ lineItemRefunds, customAmount: '' });
		expect(result).toBe('9.31');
	});

	it('large order: 20 items with 3 taxes each', () => {
		const lineItemRefunds = Array.from({ length: 20 }, () => ({
			refund_total: '5.00',
			refund_tax: [
				{ id: 1, refund_total: '0.50' },
				{ id: 2, refund_total: '0.25' },
				{ id: 3, refund_total: '0.10' },
			],
		}));
		// 20 * (5.00 + 0.50 + 0.25 + 0.10) = 20 * 5.85 = 117.00
		const result = calculateRefundTotal({ lineItemRefunds, customAmount: '' });
		expect(result).toBe('117.00');
	});
});

// ---------------------------------------------------------------------------
// G. maxRefundable / Sequential Refunds
// ---------------------------------------------------------------------------

describe('G. maxRefundable — sequential refunds', () => {
	it('no previous refunds', () => {
		expect(computeMaxRefundable('100.00', [])).toBe(100.0);
	});

	it('one previous partial refund', () => {
		expect(computeMaxRefundable('100.00', [{ total: '-30.00' }])).toBe(70.0);
	});

	it('two previous partial refunds', () => {
		expect(computeMaxRefundable('100.00', [{ total: '-30.00' }, { total: '-20.00' }])).toBe(50.0);
	});

	it('refunds exactly equal order total → 0.00 remaining', () => {
		expect(computeMaxRefundable('100.00', [{ total: '-100.00' }])).toBe(0.0);
	});

	it('refunds exceed order total → negative (no server-side guard in POS)', () => {
		expect(computeMaxRefundable('100.00', [{ total: '-60.00' }, { total: '-60.00' }])).toBe(-20.0);
	});

	it('fractional rounding: three $3.33 refunds from $10.00 → $0.01 remaining', () => {
		expect(
			computeMaxRefundable('10.00', [{ total: '-3.33' }, { total: '-3.33' }, { total: '-3.33' }])
		).toBe(0.01);
	});

	it('handles positive total values in refunds array (Math.abs)', () => {
		// WC sometimes stores refund totals as negative, sometimes positive
		expect(computeMaxRefundable('100.00', [{ total: '50.00' }])).toBe(50.0);
	});
});

// ---------------------------------------------------------------------------
// H. dp=0 — Zero decimal currencies (JPY, KRW, VND)
//
// WooCommerce stores with wc_price_decimals=0 use whole-number amounts.
// PHP: round($value, 0, PHP_ROUND_HALF_UP)
// ---------------------------------------------------------------------------

describe('H. dp=0 — Zero decimal currencies (JPY)', () => {
	const dp = 0;

	it('clean split: 1 of 3 from ¥3000', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '3000',
			taxes: [{ id: 1, total: '300' }],
			refundQty: 1,
			dp,
		});
		expect(result.refund_total).toBe('1000');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '100' }]);
	});

	it('rounding: 1 of 3 from ¥1000 → 333.33 → 333', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '1000',
			taxes: [],
			refundQty: 1,
			dp,
		});
		expect(result.refund_total).toBe('333');
	});

	it('rounding: 2 of 3 from ¥1000 → 666.67 → 667', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '1000',
			taxes: [],
			refundQty: 2,
			dp,
		});
		expect(result.refund_total).toBe('667');
	});

	it('midpoint: 1 of 2 from ¥1001 → 500.5 → 501 (HALF_UP)', () => {
		const result = calculateLineItemRefund({
			quantity: 2,
			total: '1001',
			taxes: [],
			refundQty: 1,
			dp,
		});
		expect(result.refund_total).toBe('501');
	});

	it('full refund: ¥9999', () => {
		const result = calculateLineItemRefund({
			quantity: 1,
			total: '9999',
			taxes: [{ id: 1, total: '909' }],
			refundQty: 1,
			dp,
		});
		expect(result.refund_total).toBe('9999');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '909' }]);
	});

	it('zero refund returns "0" not "0.00"', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '3000',
			taxes: [{ id: 1, total: '300' }],
			refundQty: 0,
			dp,
		});
		expect(result.refund_total).toBe('0');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '0' }]);
	});

	it('calculateRefundTotal with dp=0', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [
				{ refund_total: '1000', refund_tax: [{ id: 1, refund_total: '100' }] },
				{ refund_total: '500', refund_tax: [{ id: 1, refund_total: '50' }] },
			],
			customAmount: '200',
			dp,
		});
		expect(result).toBe('1850');
	});

	it('computeMaxRefundable with dp=0', () => {
		expect(computeMaxRefundable('10000', [{ total: '-3000' }, { total: '-2000' }], dp)).toBe(5000);
	});
});

// ---------------------------------------------------------------------------
// I. dp=3 — Three decimal currencies (KWD, BHD, OMR)
//
// WooCommerce stores with wc_price_decimals=3 use three decimal places.
// PHP: round($value, 3, PHP_ROUND_HALF_UP)
// ---------------------------------------------------------------------------

describe('I. dp=3 — Three decimal currencies (KWD)', () => {
	const dp = 3;

	it('clean split: 1 of 3 from 30.000 KWD', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '30.000',
			taxes: [{ id: 1, total: '1.500' }],
			refundQty: 1,
			dp,
		});
		expect(result.refund_total).toBe('10.000');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '0.500' }]);
	});

	it('rounding: 1 of 7 from 10.000 KWD → 1.42857 → 1.429', () => {
		const result = calculateLineItemRefund({
			quantity: 7,
			total: '10.000',
			taxes: [],
			refundQty: 1,
			dp,
		});
		expect(result.refund_total).toBe('1.429');
	});

	it('rounding: 1 of 3 from 10.000 KWD → 3.33333 → 3.333', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '10.000',
			taxes: [],
			refundQty: 1,
			dp,
		});
		expect(result.refund_total).toBe('3.333');
	});

	it('midpoint: qty=4 total="10.700" → 2.675 → 2.675 (exact at 3dp)', () => {
		const result = calculateLineItemRefund({
			quantity: 4,
			total: '10.700',
			taxes: [],
			refundQty: 1,
			dp,
		});
		expect(result.refund_total).toBe('2.675');
	});

	it('full refund with multiple taxes', () => {
		const result = calculateLineItemRefund({
			quantity: 1,
			total: '50.000',
			taxes: [
				{ id: 1, total: '2.500' },
				{ id: 2, total: '1.250' },
			],
			refundQty: 1,
			dp,
		});
		expect(result.refund_total).toBe('50.000');
		expect(result.refund_tax).toEqual([
			{ id: 1, refund_total: '2.500' },
			{ id: 2, refund_total: '1.250' },
		]);
	});

	it('zero refund returns "0.000"', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '30.000',
			taxes: [],
			refundQty: 0,
			dp,
		});
		expect(result.refund_total).toBe('0.000');
	});

	it('calculateRefundTotal with dp=3', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [{ refund_total: '10.000', refund_tax: [{ id: 1, refund_total: '0.500' }] }],
			customAmount: '3.000',
			dp,
		});
		expect(result).toBe('13.500');
	});

	it('computeMaxRefundable with dp=3', () => {
		expect(computeMaxRefundable('100.000', [{ total: '-30.000' }], dp)).toBe(70.0);
	});
});
