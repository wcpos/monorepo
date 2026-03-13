/**
 * @jest-environment node
 *
 * Tests for calculateCouponDiscountTaxSplit — the function that splits a coupon's
 * discount into tax-exclusive discount and discount_tax to match WooCommerce behavior.
 *
 * WooCommerce behavior:
 * - prices_include_tax = true:  coupon amount is tax-inclusive, tax is extracted
 * - prices_include_tax = false: coupon amount is tax-exclusive, tax is calculated on top
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
	describe('prices include tax (tax-inclusive)', () => {
		it('splits a fixed_product discount for a single item at 10%', () => {
			// Coupon: $1 off per item, 1 item, 10% tax
			// WC expects: discount = 1/1.1 = 0.909090..., discount_tax = 1 - 0.909090... = 0.090909...
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 1 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10], true);

			expect(parseFloat(result.discount)).toBeCloseTo(0.909091, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0.090909, 4);
			// Sum should equal the original discount
			expect(parseFloat(result.discount) + parseFloat(result.discount_tax)).toBeCloseTo(1, 6);
		});

		it('splits a fixed_product discount across two items at 10%', () => {
			// Matches the user's real scenario: $1/item coupon, 2 items, 10% tax
			// WC returns: discount = 1.82, discount_tax = 0.18
			const perItem: PerItemDiscount[] = [
				{ product_id: 66, discount: 1 },
				{ product_id: 69, discount: 1 },
			];
			const lineItems = [
				{ product_id: 66, tax_class: '' },
				{ product_id: 69, tax_class: '' },
			];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10], true);

			// Total discount = $2, split at 10% inclusive
			// $2 / 1.1 = $1.818181... ≈ $1.818182
			// $2 - $1.818181... = $0.181818... ≈ $0.181818
			expect(parseFloat(result.discount)).toBeCloseTo(1.818182, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0.181818, 4);
			expect(parseFloat(result.discount) + parseFloat(result.discount_tax)).toBeCloseTo(2, 6);
		});

		it('splits a percent discount at 10%', () => {
			// 30% coupon on a $100 item = $30 discount (tax-inclusive)
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 30 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10], true);

			// $30 / 1.1 = $27.272727...
			expect(parseFloat(result.discount)).toBeCloseTo(27.272727, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(2.727273, 4);
			expect(parseFloat(result.discount) + parseFloat(result.discount_tax)).toBeCloseTo(30, 6);
		});

		it('splits a fixed_cart discount proportionally distributed', () => {
			// $10 cart coupon split across items
			const perItem: PerItemDiscount[] = [
				{ product_id: 1, discount: 6 },
				{ product_id: 2, discount: 4 },
			];
			const lineItems = [
				{ product_id: 1, tax_class: '' },
				{ product_id: 2, tax_class: '' },
			];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10], true);

			// Total $10 / 1.1 = $9.090909...
			expect(parseFloat(result.discount)).toBeCloseTo(9.090909, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0.909091, 4);
			expect(parseFloat(result.discount) + parseFloat(result.discount_tax)).toBeCloseTo(10, 6);
		});
	});

	describe('prices exclude tax (tax-exclusive)', () => {
		it('calculates discount_tax on top for a single item at 10%', () => {
			// Coupon: $1 off, 10% tax-exclusive
			// WC expects: discount = $1, discount_tax = $1 × 10% = $0.10
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 1 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10], false);

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

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10], false);

			expect(parseFloat(result.discount)).toBeCloseTo(2, 6);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0.2, 6);
		});
	});

	describe('mixed tax classes', () => {
		it('applies different rates per item based on tax_class', () => {
			// Item 1: standard 10%, Item 2: reduced 5%
			const perItem: PerItemDiscount[] = [
				{ product_id: 1, discount: 10 },
				{ product_id: 2, discount: 10 },
			];
			const lineItems = [
				{ product_id: 1, tax_class: '' }, // standard
				{ product_id: 2, tax_class: 'reduced-rate' },
			];

			const result = calculateCouponDiscountTaxSplit(
				perItem,
				lineItems,
				[standardRate10, reducedRate5],
				true
			);

			// Item 1: $10 / 1.10 = $9.090909, tax = $0.909091
			// Item 2: $10 / 1.05 = $9.52381, tax = $0.47619
			// Total discount = 9.090909 + 9.52381 = 18.614719
			// Total tax = 0.909091 + 0.47619 = 1.385281
			expect(parseFloat(result.discount)).toBeCloseTo(18.614719, 3);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(1.385281, 3);
			expect(parseFloat(result.discount) + parseFloat(result.discount_tax)).toBeCloseTo(20, 4);
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

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10], true);

			// Item 1: $10 / 1.10 = $9.090909, tax = $0.909091
			// Item 2: no rates → full discount, no tax
			expect(parseFloat(result.discount)).toBeCloseTo(19.090909, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0.909091, 4);
		});
	});

	describe('compound tax rates', () => {
		it('handles compound tax rate with inclusive pricing', () => {
			// 10% compound rate on $10 discount
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 10 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [compoundRate10], true);

			// Compound inclusive: tax = 10 - 10/(1+0.1) = 10 - 9.0909 = 0.9091
			expect(parseFloat(result.discount)).toBeCloseTo(9.090909, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0.909091, 4);
		});
	});

	describe('edge cases', () => {
		it('returns zero discount and tax for empty per-item discounts', () => {
			const result = calculateCouponDiscountTaxSplit(
				[],
				[{ product_id: 1, tax_class: '' }],
				[standardRate10],
				true
			);

			expect(result.discount).toBe('0');
			expect(result.discount_tax).toBe('0');
		});

		it('returns zero discount and tax for zero-value discounts', () => {
			const result = calculateCouponDiscountTaxSplit(
				[{ product_id: 1, discount: 0 }],
				[{ product_id: 1, tax_class: '' }],
				[standardRate10],
				true
			);

			expect(result.discount).toBe('0');
			expect(result.discount_tax).toBe('0');
		});

		it('handles missing line item for a product_id', () => {
			// Product not found in line items — defaults to standard tax class
			const perItem: PerItemDiscount[] = [{ product_id: 999, discount: 10 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10], true);

			// Falls back to 'standard' class, so standard rate applies
			expect(parseFloat(result.discount)).toBeCloseTo(9.090909, 4);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0.909091, 4);
		});

		it('handles empty tax rates array', () => {
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 10 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [], true);

			// No tax rates → full discount, no tax
			expect(parseFloat(result.discount)).toBeCloseTo(10, 6);
			expect(parseFloat(result.discount_tax)).toBeCloseTo(0, 6);
		});

		it('returns string values rounded to 6 decimal places', () => {
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 1 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10], true);

			// Check that values are strings with at most 6 decimal places
			expect(typeof result.discount).toBe('string');
			expect(typeof result.discount_tax).toBe('string');
			const decimalPlaces = result.discount.split('.')[1]?.length ?? 0;
			expect(decimalPlaces).toBeLessThanOrEqual(6);
		});

		it('handles large discount amounts', () => {
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: 99999.99 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10], true);

			expect(parseFloat(result.discount) + parseFloat(result.discount_tax)).toBeCloseTo(
				99999.99,
				2
			);
		});

		it('handles negative discount (should not occur but be safe)', () => {
			const perItem: PerItemDiscount[] = [{ product_id: 1, discount: -5 }];
			const lineItems = [{ product_id: 1, tax_class: '' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, [standardRate10], true);

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
			const perItem: PerItemDiscount[] = [
				{ product_id: 66, discount: 1 },
				{ product_id: 69, discount: 1 },
			];
			const lineItems = [
				{ product_id: 66, tax_class: '' },
				{ product_id: 69, tax_class: '' },
			];
			// The user's tax rate is 10% compound
			const rates = [{ id: 4, rate: '10', compound: true, order: 1, class: 'standard' }];

			const result = calculateCouponDiscountTaxSplit(perItem, lineItems, rates, true);

			// WC returned discount = "1.82" (2dp), we calculate to 6dp
			// $2 / 1.1 = $1.818181... and $2 × 10/110 = $0.181818...
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
