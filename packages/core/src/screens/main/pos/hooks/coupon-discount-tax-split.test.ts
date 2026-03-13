/**
 * @jest-environment node
 *
 * Tests for calculateCouponDiscountTaxSplit -- the function that splits a coupon's
 * ex-tax discount into discount and discount_tax amounts.
 *
 * The function always receives ex-tax discount amounts. When prices include tax,
 * the caller is responsible for converting to ex-tax first via convertDiscountsToExTax.
 */
import { calculateCouponDiscountTaxSplit } from './coupon-helpers';

import type { PerItemDiscount } from './coupon-discount';

// Standard 10% tax rate (non-compound)
const standardRate10 = {
	id: 4,
	rate: '10',
	compound: false,
	order: 1,
	class: 'standard',
};

// Reduced 5% tax rate
const reducedRate5 = {
	id: 5,
	rate: '5',
	compound: false,
	order: 1,
	class: 'reduced-rate',
};

// Compound 10% tax rate
const compoundRate10 = {
	id: 6,
	rate: '10',
	compound: true,
	order: 2,
	class: 'standard',
};

describe('calculateCouponDiscountTaxSplit', () => {
	describe('ex-tax discounts (prices include tax, already converted)', () => {
		it('calculates tax on an ex-tax discount for a single item at 10%', () => {
			// Original tax-inclusive discount was $1, converted to ex-tax: $1/1.1 = $0.909091
			// Tax on $0.909091 at 10% = $0.090909
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 0.909091 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10]);

			expect(parseFloat(result.discount)).toBeCloseTo(0.909091, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0.090909, 4);
		});

		it('calculates tax on ex-tax discounts across two items at 10%', () => {
			// Original: $1/item tax-inclusive, ex-tax: $0.909091 each
			const perItem: PerItemDiscount[] = [
				{ product_id: 66, discount: 0.909091 },
				{ product_id: 69, discount: 0.909091 },
			];
			const lineItems = [
				{ product_id: 66, tax_class: '' },
				{ product_id: 69, tax_class: '' },
			];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10]);

			// Total ex-tax discount = $1.818182, tax = $0.181818
			expect(parseFloat(result.discount)).toBeCloseTo(1.818182, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0.181818, 4);
		});

		it('calculates tax on an ex-tax percent discount at 10%', () => {
			// Original: $30 tax-inclusive, ex-tax: $30/1.1 = $27.272727
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 27.272727 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10]);

			expect(parseFloat(result.discount)).toBeCloseTo(27.272727, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(2.727273, 4);
		});

		it('calculates tax on ex-tax fixed_cart discount proportionally distributed', () => {
			// Original: $6 + $4 = $10 tax-inclusive, ex-tax: $6/1.1 + $4/1.1 = $5.454545 + $3.636364
			const perItem: PerItemDiscount[] = [
				{ product_id: 1, discount: 5.454545 },
				{ product_id: 2, discount: 3.636364 },
			];
			const lineItems = [
				{ product_id: 1, tax_class: '' },
				{ product_id: 2, tax_class: '' },
			];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10]);

			// Total ex-tax = $9.090909, tax = $0.909091
			expect(parseFloat(result.discount)).toBeCloseTo(9.090909, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0.909091, 4);
		});
	});

	describe('prices exclude tax (tax-exclusive)', () => {
		it('calculates discount_tax on top for a single item at 10%', () => {
			// Coupon: $1 off, 10% tax-exclusive
			// WC expects: discount = $1, discount_tax = $1 x 10% = $0.10
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 1 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10]);

			expect(parseFloat(result.discount)).toBeCloseTo(1, 6);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0.1, 6);
		});

		it('calculates discount_tax for two items at 10%', () => {
			const perItem: PerItemDiscount[] = [
				{ product_id: 1, discount: 1 },
				{ product_id: 2, discount: 1 },
			];
			const lineItems = [
				{ product_id: 1, tax_class: '' },
				{ product_id: 2, tax_class: '' },
			];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10]);

			expect(parseFloat(result.discount)).toBeCloseTo(2, 6);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0.2, 6);
		});
	});

	describe('mixed tax classes', () => {
		it('applies different rates per item based on tax_class', () => {
			// Item 1: standard 10% on $10 ex-tax, Item 2: reduced 5% on $10 ex-tax
			const perItem: PerItemDiscount[] = [
				{ product_id: 1, discount: 10 },
				{ product_id: 2, discount: 10 },
			];
			const lineItems = [
				{ product_id: 1, tax_class: '' }, // standard
				{ product_id: 2, tax_class: 'reduced-rate' },
			];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [
				standardRate10,
				reducedRate5,
			]);

			// Item 1: $10, tax = $10 x 10% = $1.00
			// Item 2: $10, tax = $10 x 5% = $0.50
			// Total discount = $20, total tax = $1.50
			expect(parseFloat(result.discount)).toBeCloseTo(20, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(1.5, 4);
		});

		it('handles items with no matching tax rates (zero tax)', () => {
			const perItem: PerItemDiscount[] = [
				{ product_id: 1, discount: 10 },
				{ product_id: 2, discount: 10 },
			];
			const lineItems = [
				{ product_id: 1, tax_class: '' },
				{ product_id: 2, tax_class: 'zero-rate' }, // no matching rate
			];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10]);

			// Item 1: $10, tax = $1.00
			// Item 2: no rates, no tax, discount = $10
			expect(parseFloat(result.discount)).toBeCloseTo(20, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(1, 4);
		});
	});

	describe('compound tax rates', () => {
		it('handles compound tax rate on ex-tax discount', () => {
			// $10 ex-tax discount with compound 10% rate
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 10 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [compoundRate10]);

			// Compound 10% on $10 = $1.00 tax
			expect(parseFloat(result.discount)).toBeCloseTo(10, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(1, 4);
		});
	});

	describe('edge cases', () => {
		it('returns zero discount and tax for empty per-item discounts', () => {
			const result = calculateCouponDiscountTaxSplit(
				[],
				[{ product_id: 1, tax_class: '' }],
				[standardRate10]
			);

			expect(result.discount).toBe('0');
			expect(result.discount_tax).toBe('0');
		});

		it('returns zero discount and tax for zero-value discounts', () => {
			const result = calculateCouponDiscountTaxSplit(
				[{ product_id: 1, discount: 0 }],
				[{ product_id: 1, tax_class: '' }],
				[standardRate10]
			);

			expect(result.discount).toBe('0');
			expect(result.discount_tax).toBe('0');
		});

		it('handles missing line item for a product_id', () => {
			// Product not found in line items -- defaults to standard tax class
			const perItem: PerItemDiscount[] = [{ product_id: 999, discount: 10 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10]);

			// Falls back to 'standard' class, so standard rate applies
			// $10 ex-tax, tax = $1.00
			expect(parseFloat(result.discount)).toBeCloseTo(10, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(1, 4);
		});

		it('handles empty tax rates array', () => {
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 10 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, []);

			// No tax rates -> full discount, no tax
			expect(parseFloat(result.discount)).toBeCloseTo(10, 6);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0, 6);
		});

		it('returns string values rounded to 6 decimal places', () => {
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 1 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10]);

			// Check that values are strings with at most 6 decimal places
			expect(typeof result.discount).toBe('string');
			expect(typeof result.discount_tax).toBe('string');
			const decimalPlaces = result.discount.split('.')[1]?.length ?? 0;
			expect(decimalPlaces).toBeLessThanOrEqual(6);
		});

		it('handles large discount amounts', () => {
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 99999.99 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10]);

			// $99999.99 ex-tax, tax = $9999.999
			expect(parseFloat(result.discount)).toBeCloseTo(99999.99, 2);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(9999.999, 2);
		});

		it('handles negative discount (should not occur but be safe)', () => {
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: -5 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10]);

			// Negative discounts are skipped
			expect(result.discount).toBe('0');
			expect(result.discount_tax).toBe('0');
		});
	});

	describe('real-world WooCommerce parity', () => {
		it('matches WC output for fixed1limit3 coupon (user scenario)', () => {
			// Real scenario from the user:
			// Store: prices_include_tax = true, 10% compound tax rate
			// Coupon: fixed_product, $1/item
			// 2 items: Belt (product 66) and Hoodie (product 69)
			// WC server returned: discount = "1.82", discount_tax = "0.18"
			//
			// The caller converts tax-inclusive $1 discounts to ex-tax via
			// convertDiscountsToExTax: $1/1.1 = $0.909091 each
			const perItem: PerItemDiscount[] = [
				{ product_id: 66, discount: 0.909091 },
				{ product_id: 69, discount: 0.909091 },
			];
			const lineItems = [
				{ product_id: 66, tax_class: '' },
				{ product_id: 69, tax_class: '' },
			];
			// The user's tax rate is 10% compound
			const rates = [{ id: 4, rate: '10', compound: true, order: 1, class: 'standard' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, rates);

			// Total ex-tax discount = $1.818182, tax = $0.181818
			expect(parseFloat(result.discount)).toBeCloseTo(1.818182, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0.181818, 4);

			// When rounded to 2dp (as WC displays): 1.82 + 0.18 = 2.00
			expect(
				Math.round(parseFloat(result.discount) * 100) / 100 +
					Math.round(parseFloat(result.discount_tax) * 100) / 100
			).toBeCloseTo(2, 2);
		});
	});
});
