import { calculateOrderTotals } from './calculate-order-totals';

describe('calculateOrderTotals', () => {
	const mockTaxRates = [
		{ id: 1, name: 'Tax 1', rate: '10', compound: false },
		{ id: 2, name: 'Tax 2', rate: '5', compound: true },
	] as any; // Cast to any for testing with mock data

	describe('basic calculations', () => {
		it('calculates totals correctly for simple line items', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: '90',
					subtotal_tax: '10',
					total_tax: '9',
					taxes: [{ id: 1, total: '9' }],
				},
			];
			const shippingLines = [{ total: '10', total_tax: '1', taxes: [{ id: 1, total: '1' }] }];
			const feeLines = [{ total: '5', total_tax: '0.5', taxes: [{ id: 2, total: '0.5' }] }];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				shippingLines: shippingLines as any,
				feeLines: feeLines as any,
				taxRates: mockTaxRates,
				taxRoundAtSubtotal: false,
			});

			// Based on implementation logic:
			// - Line item: subtotal=100, total=90, subtotal_tax=10, total_tax=9
			//   discount_total = 100 - 90 = 10, discount_tax = 10 - 9 = 1
			//   taxLines[1].tax_total += 9
			// - Shipping: total=10, total_tax=1
			//   taxLines[1].shipping_tax_total += 1
			// - Fee: total=5, total_tax=0.5
			//   taxLines[2].tax_total += 0.5
			// cart_tax = sumBy(taxLines, 'tax_total') = 9 + 0.5 = 9.5
			// total = 90 + 5 + 10 = 105, total_tax = 9 + 0.5 + 1 = 10.5
			// final total = total + total_tax = 115.5
			expect(result).toEqual({
				discount_total: '10',
				discount_tax: '1',
				shipping_total: '10',
				shipping_tax: '1',
				cart_tax: '9.5',
				total: '115.5',
				total_tax: '10.5',
				tax_lines: expect.arrayContaining([
					expect.objectContaining({
						rate_id: 1,
						tax_total: '9',
						shipping_tax_total: '1',
					}),
					expect.objectContaining({
						rate_id: 2,
						tax_total: '0.5',
						shipping_tax_total: '0',
					}),
				]),
				subtotal: '100',
				subtotal_tax: '10',
				fee_total: '5',
				fee_tax: '0.5',
				coupon_total: '0',
				coupon_tax: '0',
			});
		});

		it('handles empty input arrays', () => {
			const result = calculateOrderTotals({
				lineItems: [],
				shippingLines: [],
				feeLines: [],
				taxRates: mockTaxRates,
				taxRoundAtSubtotal: false,
			});

			expect(result).toEqual({
				discount_total: '0',
				discount_tax: '0',
				shipping_total: '0',
				shipping_tax: '0',
				cart_tax: '0',
				total: '0',
				total_tax: '0',
				tax_lines: [],
				subtotal: '0',
				subtotal_tax: '0',
				fee_total: '0',
				fee_tax: '0',
				coupon_total: '0',
				coupon_tax: '0',
			});
		});

		it('handles undefined inputs by using default empty arrays', () => {
			const result = calculateOrderTotals({
				taxRates: mockTaxRates,
			});

			expect(result).toEqual({
				discount_total: '0',
				discount_tax: '0',
				shipping_total: '0',
				shipping_tax: '0',
				cart_tax: '0',
				total: '0',
				total_tax: '0',
				tax_lines: [],
				subtotal: '0',
				subtotal_tax: '0',
				fee_total: '0',
				fee_tax: '0',
				coupon_total: '0',
				coupon_tax: '0',
			});
		});
	});

	describe('parseNumber edge cases', () => {
		it('handles NaN and undefined values by treating them as 0', () => {
			const lineItems = [
				{
					subtotal: 'not-a-number', // isNaN('not-a-number') = true -> 0
					total: NaN, // isNaN(NaN) = true -> 0
					subtotal_tax: undefined, // isNaN(undefined) = true -> 0
					total_tax: '0',
					taxes: [],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			// NaN/undefined values should be treated as 0
			expect(result.subtotal).toBe('0');
			expect(result.total).toBe('0');
			expect(result.subtotal_tax).toBe('0');
			expect(result.total_tax).toBe('0');
			expect(result.discount_total).toBe('0');
		});

		it('handles null values by treating them as 0', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: null,
					subtotal_tax: '0',
					total_tax: '0',
					taxes: [],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			// null is treated as 0
			expect(result.total).toBe('0');
		});

		it('handles numeric strings correctly', () => {
			const lineItems = [
				{
					subtotal: '50.5',
					total: '45.5',
					subtotal_tax: '5.05',
					total_tax: '4.55',
					taxes: [{ id: 1, total: '4.55' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			expect(result.subtotal).toBe('50.5');
			expect(result.total).toBe('50.05'); // total + total_tax
			expect(result.discount_total).toBe('5'); // 50.5 - 45.5
		});
	});

	describe('taxes array handling', () => {
		it('handles line items without taxes array', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: '100',
					subtotal_tax: '0',
					total_tax: '0',
					// No taxes property
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			expect(result.subtotal).toBe('100');
			expect(result.tax_lines).toEqual([]);
		});

		it('handles fee lines without taxes array', () => {
			const feeLines = [
				{
					total: '10',
					total_tax: '0',
					// No taxes property
				},
			];

			const result = calculateOrderTotals({
				feeLines: feeLines as any,
				taxRates: mockTaxRates,
			});

			expect(result.fee_total).toBe('10');
			expect(result.tax_lines).toEqual([]);
		});

		it('handles shipping lines without taxes array', () => {
			const shippingLines = [
				{
					total: '15',
					total_tax: '0',
					// No taxes property
				},
			];

			const result = calculateOrderTotals({
				shippingLines: shippingLines as any,
				taxRates: mockTaxRates,
			});

			expect(result.shipping_total).toBe('15');
			expect(result.tax_lines).toEqual([]);
		});

		it('handles taxes as null instead of array', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: '100',
					subtotal_tax: '0',
					total_tax: '0',
					taxes: null,
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			// Should not throw and should process correctly
			expect(result.subtotal).toBe('100');
		});
	});

	describe('tax lines filtering', () => {
		it('filters out tax lines with zero totals', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: '100',
					subtotal_tax: '10',
					total_tax: '10',
					taxes: [{ id: 1, total: '10' }], // Only tax rate 1 has tax
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			// Tax rate 2 should be filtered out (both tax_total and shipping_tax_total are 0)
			expect(result.tax_lines).toHaveLength(1);
			expect(result.tax_lines[0]).toMatchObject({
				rate_id: 1,
				tax_total: '10',
			});
		});

		it('includes tax line with only shipping_tax_total', () => {
			const shippingLines = [
				{
					total: '10',
					total_tax: '1',
					taxes: [{ id: 2, total: '1' }], // Tax rate 2 has shipping tax only
				},
			];

			const result = calculateOrderTotals({
				shippingLines: shippingLines as any,
				taxRates: mockTaxRates,
			});

			// Tax rate 2 should be included (has shipping_tax_total)
			expect(result.tax_lines).toHaveLength(1);
			expect(result.tax_lines[0]).toMatchObject({
				rate_id: 2,
				shipping_tax_total: '1',
				tax_total: '0',
			});
		});

		it('handles empty tax rates array', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: '100',
					subtotal_tax: '0',
					total_tax: '0',
					taxes: [],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: [],
			});

			expect(result.tax_lines).toEqual([]);
			expect(result.cart_tax).toBe('0');
		});
	});

	describe('multiple line items aggregation', () => {
		it('aggregates totals from multiple line items', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: '90',
					subtotal_tax: '10',
					total_tax: '9',
					taxes: [{ id: 1, total: '9' }],
				},
				{
					subtotal: '50',
					total: '50',
					subtotal_tax: '5',
					total_tax: '5',
					taxes: [{ id: 1, total: '5' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			expect(result.subtotal).toBe('150'); // 100 + 50
			expect(result.subtotal_tax).toBe('15'); // 10 + 5
			expect(result.discount_total).toBe('10'); // (100-90) + (50-50)
			expect(result.tax_lines[0]).toMatchObject({
				rate_id: 1,
				tax_total: '14', // 9 + 5
			});
		});

		it('aggregates totals across line items, fees, and shipping', () => {
			const lineItems = [
				{
					subtotal: '100',
					total: '100',
					subtotal_tax: '10',
					total_tax: '10',
					taxes: [{ id: 1, total: '10' }],
				},
			];
			const feeLines = [
				{
					total: '5',
					total_tax: '0.5',
					taxes: [{ id: 1, total: '0.5' }],
				},
			];
			const shippingLines = [
				{
					total: '10',
					total_tax: '1',
					taxes: [{ id: 1, total: '1' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				feeLines: feeLines as any,
				shippingLines: shippingLines as any,
				taxRates: mockTaxRates,
			});

			// total = 100 + 5 + 10 = 115
			// total_tax = 10 + 0.5 + 1 = 11.5
			// final total = 115 + 11.5 = 126.5
			expect(result.total).toBe('126.5');
			expect(result.total_tax).toBe('11.5');
			expect(result.cart_tax).toBe('10.5'); // line item tax + fee tax (not shipping)
			expect(result.shipping_tax).toBe('1');
		});
	});

	describe('rounding', () => {
		it('rounds values to dp decimal places (default 2)', () => {
			const lineItems = [
				{
					subtotal: '33.333333333',
					total: '33.333333333',
					subtotal_tax: '3.3333333333',
					total_tax: '3.3333333333',
					taxes: [{ id: 1, total: '3.3333333333' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
			});

			// Now rounds to dp (default 2) to match WooCommerce
			expect(result.subtotal).toBe('33.33');
			expect(result.subtotal_tax).toBe('3.33');
		});

		it('rounds to custom dp when specified', () => {
			const lineItems = [
				{
					subtotal: '33.333333333',
					total: '33.333333333',
					subtotal_tax: '3.3333333333',
					total_tax: '3.3333333333',
					taxes: [{ id: 1, total: '3.3333333333' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
				dp: 4,
			});

			expect(result.subtotal).toBe('33.3333');
			expect(result.subtotal_tax).toBe('3.3333');
		});

		it('dp=0 (JPY): rounds to whole numbers', () => {
			const lineItems = [
				{
					subtotal: '1000',
					total: '900',
					subtotal_tax: '100',
					total_tax: '90',
					taxes: [{ id: 1, total: '90' }],
				},
			];
			const shippingLines = [{ total: '500', total_tax: '50', taxes: [{ id: 1, total: '50' }] }];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				shippingLines: shippingLines as any,
				taxRates: mockTaxRates,
				dp: 0,
			});

			expect(result.subtotal).toBe('1000');
			expect(result.discount_total).toBe('100');
			expect(result.shipping_total).toBe('500');
			expect(result.total_tax).toBe('140');
			expect(result.total).toBe('1540');
		});

		it('dp=3: rounds to 3 decimal places', () => {
			const lineItems = [
				{
					subtotal: '9.999',
					total: '9.999',
					subtotal_tax: '0.9999',
					total_tax: '0.9999',
					taxes: [{ id: 1, total: '0.9999' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: mockTaxRates,
				dp: 3,
			});

			expect(result.subtotal).toBe('9.999');
			expect(result.subtotal_tax).toBe('1');
			expect(result.total).toBe('10.999');
		});
	});
});

describe('coupon line calculations', () => {
	it('derives discount from line item subtotal-total difference', () => {
		// Coupon discounts are now applied directly to line item totals.
		// calculateOrderTotals derives discount_total/discount_tax from
		// the difference between subtotal and total on each line item.
		const lineItems = [
			{
				subtotal: '100',
				total: '90',
				subtotal_tax: '10',
				total_tax: '9',
				taxes: [{ id: 1, total: '9' }],
			},
		];
		const couponLines = [
			{
				code: 'SAVE10',
				discount: '10',
				discount_tax: '0',
			},
		];

		const result = calculateOrderTotals({
			lineItems: lineItems as any,
			couponLines: couponLines as any,
			taxRates: [{ id: 1, name: 'Tax', rate: '10', compound: false }] as any,
			taxRoundAtSubtotal: false,
		});

		expect(result.discount_total).toBe('10');
		expect(result.discount_tax).toBe('1');
		expect(result.total).toBe('99');
		expect(result.cart_tax).toBe('9');
	});

	it('handles synced coupon discounts (already in line items)', () => {
		const lineItems = [
			{
				subtotal: '100',
				total: '90',
				subtotal_tax: '10',
				total_tax: '9',
				taxes: [{ id: 1, total: '9' }],
			},
		];
		const couponLines = [
			{
				id: 123,
				code: 'SAVE10',
				discount: '10',
				discount_tax: '1',
			},
		];

		const result = calculateOrderTotals({
			lineItems: lineItems as any,
			couponLines: couponLines as any,
			taxRates: [{ id: 1, name: 'Tax', rate: '10', compound: false }] as any,
			taxRoundAtSubtotal: false,
		});

		expect(result.discount_total).toBe('10');
		expect(result.discount_tax).toBe('1');
		expect(result.total).toBe('99');
		expect(result.coupon_total).toBe('10');
		expect(result.coupon_tax).toBe('1');
	});

	it('handles multiple coupons applied to line items', () => {
		// Two coupons: total discount of 15, applied to line items
		const lineItems = [
			{
				subtotal: '200',
				total: '185',
				subtotal_tax: '20',
				total_tax: '18.5',
				taxes: [{ id: 1, total: '18.5' }],
			},
		];
		const couponLines = [
			{ code: 'SAVE10', discount: '10', discount_tax: '0' },
			{ code: 'EXTRA5', discount: '5', discount_tax: '0' },
		];

		const result = calculateOrderTotals({
			lineItems: lineItems as any,
			couponLines: couponLines as any,
			taxRates: [{ id: 1, name: 'Tax', rate: '10', compound: false }] as any,
			taxRoundAtSubtotal: false,
		});

		expect(result.discount_total).toBe('15');
		expect(result.discount_tax).toBe('1.5');
		expect(result.total).toBe('203.5');
		expect(result.coupon_total).toBe('15');
		expect(result.coupon_tax).toBe('0');
	});

	it('works with no coupon lines', () => {
		const lineItems = [
			{
				subtotal: '100',
				total: '100',
				subtotal_tax: '10',
				total_tax: '10',
				taxes: [{ id: 1, total: '10' }],
			},
		];

		const result = calculateOrderTotals({
			lineItems: lineItems as any,
			taxRates: [{ id: 1, name: 'Tax', rate: '10', compound: false }] as any,
			taxRoundAtSubtotal: false,
		});

		expect(result.discount_total).toBe('0');
		expect(result.coupon_total).toBe('0');
		expect(result.coupon_tax).toBe('0');
	});
});

/**
 * Parity regression tests — specific scenarios that caught bugs during
 * integration testing against WooCommerce servers.
 */
describe('calculateOrderTotals — parity regressions', () => {
	describe('dev-free: per-item tax rounding when taxRoundAtSubtotal=false', () => {
		// Bug: two items with per-rate taxes 1.633 and 1.634.
		// WC rounds each to dp before summing into tax_lines → 1.63 + 1.63 = 3.26.
		// Client was summing unrounded → 3.267, rounding to 3.27.
		it('rounds per-rate taxes before summing into tax_lines', () => {
			const lineItems = [
				{
					subtotal: '18',
					total: '16.33',
					subtotal_tax: '1.8',
					total_tax: '1.633',
					taxes: [{ id: 6, subtotal: '1.8', total: '1.633' }],
				},
				{
					subtotal: '18',
					total: '16.34',
					subtotal_tax: '1.8',
					total_tax: '1.634',
					taxes: [{ id: 6, subtotal: '1.8', total: '1.634' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: [{ id: 6, name: 'US Tax', rate: '10', compound: false }] as any,
				taxRoundAtSubtotal: false,
				pricesIncludeTax: false,
				couponLines: [{ discount: '3.33', discount_tax: '0.34' }] as any,
			});

			// Per-item rounded: round(1.633, 2) = 1.63, round(1.634, 2) = 1.63
			// Sum = 3.26, NOT 3.27
			expect(result.total_tax).toBe('3.26');
			expect(result.tax_lines).toEqual(
				expect.arrayContaining([expect.objectContaining({ rate_id: 6, tax_total: '3.26' })])
			);
		});

		it('keeps full precision when taxRoundAtSubtotal=true', () => {
			const lineItems = [
				{
					subtotal: '18',
					total: '16.33',
					subtotal_tax: '1.8',
					total_tax: '1.633',
					taxes: [{ id: 6, subtotal: '1.8', total: '1.633' }],
				},
				{
					subtotal: '18',
					total: '16.34',
					subtotal_tax: '1.8',
					total_tax: '1.634',
					taxes: [{ id: 6, subtotal: '1.8', total: '1.634' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: [{ id: 6, name: 'US Tax', rate: '10', compound: false }] as any,
				taxRoundAtSubtotal: true,
				pricesIncludeTax: false,
			});

			// Full precision sum: 1.633 + 1.634 = 3.267 → round final = 3.27
			expect(result.total_tax).toBe('3.27');
		});
	});

	describe('dev-free: discount_tax with float subtraction artifacts', () => {
		// Bug: 4.5 - 4.275 = 0.22499... in IEEE 754 (not 0.225).
		// Fix: pre-round to WC rounding precision (6dp) before rounding to dp.
		// This snaps 0.22499... → 0.225 → round(0.225, 2) = 0.23.
		it('pre-rounds discount_tax to rounding precision (single coupon)', () => {
			const lineItems = [
				{
					subtotal: '45',
					total: '42.75',
					subtotal_tax: '4.5',
					total_tax: '4.275',
					taxes: [{ id: 6, subtotal: '4.5', total: '4.275' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: [{ id: 6, name: 'US Tax', rate: '10', compound: false }] as any,
				taxRoundAtSubtotal: false,
				pricesIncludeTax: false,
			});

			// 4.5 - 4.275 = 0.22499... → 6dp: 0.225 → 2dp: 0.23
			expect(result.discount_tax).toBe('0.23');
		});

		it('preserves stacked coupon discount_tax (no over-rounding)', () => {
			// prod8 + pct12 on Beanie ($18): total_tax = 0.687
			// discount_tax = 1.8 - 0.687 = 1.113 → 6dp: 1.113 → 2dp: 1.11
			const lineItems = [
				{
					subtotal: '18',
					total: '6.87',
					subtotal_tax: '1.8',
					total_tax: '0.687',
					taxes: [{ id: 6, subtotal: '1.8', total: '0.687' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: [{ id: 6, name: 'US Tax', rate: '10', compound: false }] as any,
				taxRoundAtSubtotal: false,
				pricesIncludeTax: false,
			});

			// 1.8 - 0.687 = 1.113 → 6dp: 1.113 → 2dp: 1.11 (NOT 1.12)
			expect(result.discount_tax).toBe('1.11');
		});
	});
});
