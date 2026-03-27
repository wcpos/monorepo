import { calculateOrderTotals } from './calculate-order-totals';

/**
 * Regression test: when coupon replay adjusts line items, computing totals
 * from those adjusted items should produce the final correct values in one
 * pass — no intermediate "pre-coupon" calculation should be visible.
 *
 * This validates the fix for the tax flash race condition where
 * useOrderTotals ran with pre-coupon line items before the async coupon
 * replay patched them.
 */
describe('calculateOrderTotals with coupon-adjusted line items', () => {
	it('produces correct tax_lines from post-coupon line items (GBP VAT + Surcharge)', () => {
		// Real scenario from debugging: Belt (£55 POS price) + custom product (£2)
		// with "penny" coupon applied. These are the line items AFTER coupon replay.
		const postCouponLineItems = [
			{
				product_id: 67,
				subtotal: '44.93464',
				total: '44.92647',
				subtotal_tax: '10.06536',
				total_tax: '10.06353',
				taxes: [
					{ id: 10, subtotal: '9.166667', total: '9.165' },
					{ id: 7, subtotal: '0.898693', total: '0.89853' },
				],
			},
			{
				product_id: 0,
				subtotal: '1.633987',
				total: '1.633987',
				subtotal_tax: '0.366013',
				total_tax: '0.366013',
				taxes: [
					{ id: 10, subtotal: '0.333333', total: '0.333333' },
					{ id: 7, subtotal: '0.03268', total: '0.03268' },
				],
			},
		];

		const couponLines = [{ code: 'penny', discount: '0.00817', discount_tax: '0.00183' }];

		const taxRates = [
			{ id: 10, name: 'VAT', rate: '20', compound: true },
			{ id: 7, name: 'Surcharge', rate: '2', compound: true },
		];

		const result = calculateOrderTotals({
			lineItems: postCouponLineItems as any,
			couponLines: couponLines as any,
			taxRates: taxRates as any,
			taxRoundAtSubtotal: false,
			dp: 2,
			pricesIncludeTax: true,
		});

		// These are the CORRECT values (post-coupon). The flash bug showed
		// VAT=9.31, Surcharge=1.12 from pre-coupon items.
		const vatLine = result.tax_lines.find((t) => t.rate_id === 10);
		const surLine = result.tax_lines.find((t) => t.rate_id === 7);
		expect(vatLine?.tax_total).toBe('9.49');
		expect(surLine?.tax_total).toBe('0.93');
		expect(result.total).toBe('56.98');
		expect(result.discount_total).toBe('0');
	});

	it('produces same totals as pre-coupon items when no coupons active', () => {
		// Without coupons, total === subtotal, so no flash possible
		const lineItems = [
			{
				subtotal: '44.93464',
				total: '44.93464',
				subtotal_tax: '10.06536',
				total_tax: '10.06536',
				taxes: [
					{ id: 10, subtotal: '9.166667', total: '9.166667' },
					{ id: 7, subtotal: '0.898693', total: '0.898693' },
				],
			},
		];

		const taxRates = [
			{ id: 10, name: 'VAT', rate: '20', compound: true },
			{ id: 7, name: 'Surcharge', rate: '2', compound: true },
		];

		const result = calculateOrderTotals({
			lineItems: lineItems as any,
			taxRates: taxRates as any,
			taxRoundAtSubtotal: false,
			dp: 2,
			pricesIncludeTax: true,
		});

		expect(result.discount_total).toBe('0');
		expect(result.discount_tax).toBe('0');
	});
});
