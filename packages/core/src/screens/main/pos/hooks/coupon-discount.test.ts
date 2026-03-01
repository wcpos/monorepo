/**
 * @jest-environment node
 *
 * Tests for coupon discount calculation engine.
 *
 * This is critical business logic for POS coupon discounts.
 * The calculateCouponDiscount function computes discount amounts for:
 * - percent: percentage off eligible items
 * - fixed_cart: fixed amount distributed proportionally
 * - fixed_product: fixed amount per unit of eligible items
 */
import { calculateCouponDiscount } from './coupon-discount';

import type { CouponDiscountConfig } from './coupon-discount';
import type { CouponLineItem } from './coupon-helpers';

// Helper to create a line item with sensible defaults
const createItem = (overrides: Partial<CouponLineItem> = {}): CouponLineItem => ({
	product_id: 1,
	quantity: 1,
	price: 100,
	subtotal: '100',
	total: '100',
	categories: [],
	on_sale: false,
	...overrides,
});

// Helper to create a config with sensible defaults
const createConfig = (overrides: Partial<CouponDiscountConfig> = {}): CouponDiscountConfig => ({
	discount_type: 'percent',
	amount: '10',
	limit_usage_to_x_items: null,
	product_ids: [],
	excluded_product_ids: [],
	product_categories: [],
	excluded_product_categories: [],
	exclude_sale_items: false,
	...overrides,
});

describe('coupon-discount', () => {
	describe('calculateCouponDiscount', () => {
		describe('percent discount', () => {
			it('should apply 10% off a single $100 item', () => {
				const config = createConfig({ discount_type: 'percent', amount: '10' });
				const items = [createItem({ product_id: 1, price: 100, quantity: 1 })];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBe(10);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 10 }]);
			});

			it('should apply 10% off multiple items', () => {
				const config = createConfig({ discount_type: 'percent', amount: '10' });
				const items = [
					createItem({ product_id: 1, price: 100, quantity: 2 }),
					createItem({ product_id: 2, price: 50, quantity: 1 }),
				];

				const result = calculateCouponDiscount(config, items);

				// 10% of (100*2) = 20, 10% of (50*1) = 5
				expect(result.totalDiscount).toBe(25);
				expect(result.perItem).toEqual([
					{ product_id: 1, discount: 20 },
					{ product_id: 2, discount: 5 },
				]);
			});

			it('should limit discount to top N highest-priced units with limit_usage_to_x_items', () => {
				const config = createConfig({
					discount_type: 'percent',
					amount: '50',
					limit_usage_to_x_items: 1,
				});
				const items = [
					createItem({ product_id: 1, price: 100, quantity: 1 }),
					createItem({ product_id: 2, price: 50, quantity: 1 }),
				];

				const result = calculateCouponDiscount(config, items);

				// Only 1 item gets the discount -- the $100 one (highest price)
				expect(result.totalDiscount).toBe(50);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 50 }]);
			});

			it('should limit across expanded quantities', () => {
				const config = createConfig({
					discount_type: 'percent',
					amount: '50',
					limit_usage_to_x_items: 2,
				});
				// 3 units of a $100 item, but only 2 should get the discount
				const items = [createItem({ product_id: 1, price: 100, quantity: 3 })];

				const result = calculateCouponDiscount(config, items);

				// 50% of (100 * 2) = 100
				expect(result.totalDiscount).toBe(100);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 100 }]);
			});

			it('should handle 100% off (full item price)', () => {
				const config = createConfig({ discount_type: 'percent', amount: '100' });
				const items = [createItem({ product_id: 1, price: 75, quantity: 2 })];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBe(150);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 150 }]);
			});

			it('should cap discount at item total (percent > 100 does not go negative)', () => {
				const config = createConfig({ discount_type: 'percent', amount: '150' });
				const items = [createItem({ product_id: 1, price: 40, quantity: 1 })];

				const result = calculateCouponDiscount(config, items);

				// 150% of 40 = 60, but capped at 40
				expect(result.totalDiscount).toBe(40);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 40 }]);
			});
		});

		describe('fixed cart discount', () => {
			it('should distribute $10 proportionally across $60 + $40 items', () => {
				const config = createConfig({ discount_type: 'fixed_cart', amount: '10' });
				const items = [
					createItem({ product_id: 1, price: 60, quantity: 1 }),
					createItem({ product_id: 2, price: 40, quantity: 1 }),
				];

				const result = calculateCouponDiscount(config, items);

				// $60 / $100 = 60% -> $6, $40 / $100 = 40% -> $4
				expect(result.totalDiscount).toBe(10);
				expect(result.perItem).toEqual([
					{ product_id: 1, discount: 6 },
					{ product_id: 2, discount: 4 },
				]);
			});

			it('should cap at cart total when coupon exceeds cart value', () => {
				const config = createConfig({ discount_type: 'fixed_cart', amount: '500' });
				const items = [createItem({ product_id: 1, price: 100, quantity: 1 })];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBe(100);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 100 }]);
			});

			it('should handle rounding residuals by giving remainder to last item', () => {
				const config = createConfig({ discount_type: 'fixed_cart', amount: '10' });
				// Three items at $33.33 each = $99.99 total
				const items = [
					createItem({ product_id: 1, price: 33.33, quantity: 1 }),
					createItem({ product_id: 2, price: 33.33, quantity: 1 }),
					createItem({ product_id: 3, price: 33.33, quantity: 1 }),
				];

				const result = calculateCouponDiscount(config, items);

				// Each item is ~33.33% of the total
				// First two get round($10 * 0.33336..., 2) = $3.33 each
				// Last gets remainder: $10 - $3.33 - $3.33 = $3.34
				expect(result.perItem[0].discount).toBe(3.33);
				expect(result.perItem[1].discount).toBe(3.33);
				expect(result.perItem[2].discount).toBeCloseTo(3.34, 2);
				expect(result.totalDiscount).toBeCloseTo(10, 2);
			});

			it('should handle a single item in cart', () => {
				const config = createConfig({ discount_type: 'fixed_cart', amount: '15' });
				const items = [createItem({ product_id: 1, price: 80, quantity: 1 })];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBe(15);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 15 }]);
			});

			it('should handle items with quantity > 1', () => {
				const config = createConfig({ discount_type: 'fixed_cart', amount: '20' });
				const items = [createItem({ product_id: 1, price: 50, quantity: 2 })];

				const result = calculateCouponDiscount(config, items);

				// Cart total = 100, discount = 20
				expect(result.totalDiscount).toBe(20);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 20 }]);
			});
		});

		describe('fixed product discount', () => {
			it('should apply $5 per unit across 3 units', () => {
				const config = createConfig({ discount_type: 'fixed_product', amount: '5' });
				const items = [createItem({ product_id: 1, price: 20, quantity: 3 })];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBe(15);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 15 }]);
			});

			it('should cap per-unit discount at item price', () => {
				const config = createConfig({ discount_type: 'fixed_product', amount: '200' });
				const items = [createItem({ product_id: 1, price: 50, quantity: 2 })];

				const result = calculateCouponDiscount(config, items);

				// $200 per unit capped at $50 per unit -> $50 * 2 = $100
				expect(result.totalDiscount).toBe(100);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 100 }]);
			});

			it('should only apply to eligible items when product_ids is set', () => {
				const config = createConfig({
					discount_type: 'fixed_product',
					amount: '10',
					product_ids: [1],
				});
				const items = [
					createItem({ product_id: 1, price: 30, quantity: 1 }),
					createItem({ product_id: 2, price: 30, quantity: 1 }),
				];

				const result = calculateCouponDiscount(config, items);

				// Only product 1 is eligible
				expect(result.totalDiscount).toBe(10);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 10 }]);
			});

			it('should handle multiple products with different prices', () => {
				const config = createConfig({ discount_type: 'fixed_product', amount: '10' });
				const items = [
					createItem({ product_id: 1, price: 50, quantity: 2 }),
					createItem({ product_id: 2, price: 8, quantity: 3 }),
				];

				const result = calculateCouponDiscount(config, items);

				// Product 1: $10 * 2 = $20
				// Product 2: $8 (capped) * 3 = $24
				expect(result.perItem).toEqual([
					{ product_id: 1, discount: 20 },
					{ product_id: 2, discount: 24 },
				]);
				expect(result.totalDiscount).toBe(44);
			});
		});

		describe('edge cases', () => {
			it('should return zero discount for zero amount coupon', () => {
				const config = createConfig({ amount: '0' });
				const items = [createItem()];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBe(0);
				expect(result.perItem).toEqual([]);
			});

			it('should return zero discount for empty cart', () => {
				const config = createConfig({ amount: '10' });

				const result = calculateCouponDiscount(config, []);

				expect(result.totalDiscount).toBe(0);
				expect(result.perItem).toEqual([]);
			});

			it('should return zero discount when all items are excluded', () => {
				const config = createConfig({
					discount_type: 'percent',
					amount: '10',
					excluded_product_ids: [1, 2],
				});
				const items = [createItem({ product_id: 1 }), createItem({ product_id: 2 })];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBe(0);
				expect(result.perItem).toEqual([]);
			});

			it('should return zero discount for non-numeric amount', () => {
				const config = createConfig({ amount: 'abc' });
				const items = [createItem()];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBe(0);
				expect(result.perItem).toEqual([]);
			});

			it('should never produce negative totals', () => {
				// Percent > 100
				const percentResult = calculateCouponDiscount(
					createConfig({ discount_type: 'percent', amount: '200' }),
					[createItem({ price: 50 })]
				);
				expect(percentResult.totalDiscount).toBeLessThanOrEqual(50);
				expect(percentResult.perItem[0].discount).toBeLessThanOrEqual(50);

				// Fixed cart > cart total
				const cartResult = calculateCouponDiscount(
					createConfig({ discount_type: 'fixed_cart', amount: '999' }),
					[createItem({ price: 50 })]
				);
				expect(cartResult.totalDiscount).toBeLessThanOrEqual(50);

				// Fixed product > item price
				const productResult = calculateCouponDiscount(
					createConfig({ discount_type: 'fixed_product', amount: '999' }),
					[createItem({ price: 50 })]
				);
				expect(productResult.totalDiscount).toBeLessThanOrEqual(50);
			});

			it('should handle items with zero price', () => {
				const config = createConfig({ discount_type: 'fixed_cart', amount: '10' });
				const items = [createItem({ product_id: 1, price: 0, quantity: 1 })];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBe(0);
				expect(result.perItem).toEqual([]);
			});
		});

		describe('product restriction integration', () => {
			it('should limit percent discount to specified product_ids', () => {
				const config = createConfig({
					discount_type: 'percent',
					amount: '20',
					product_ids: [2],
				});
				const items = [
					createItem({ product_id: 1, price: 100, quantity: 1 }),
					createItem({ product_id: 2, price: 80, quantity: 1 }),
				];

				const result = calculateCouponDiscount(config, items);

				// Only product 2 is eligible: 20% of 80 = 16
				expect(result.totalDiscount).toBe(16);
				expect(result.perItem).toEqual([{ product_id: 2, discount: 16 }]);
			});

			it('should exclude items via excluded_product_ids', () => {
				const config = createConfig({
					discount_type: 'percent',
					amount: '10',
					excluded_product_ids: [1],
				});
				const items = [
					createItem({ product_id: 1, price: 100, quantity: 1 }),
					createItem({ product_id: 2, price: 50, quantity: 1 }),
				];

				const result = calculateCouponDiscount(config, items);

				// Product 1 excluded, only product 2: 10% of 50 = 5
				expect(result.totalDiscount).toBe(5);
				expect(result.perItem).toEqual([{ product_id: 2, discount: 5 }]);
			});

			it('should skip on-sale items when exclude_sale_items is true', () => {
				const config = createConfig({
					discount_type: 'percent',
					amount: '25',
					exclude_sale_items: true,
				});
				const items = [
					createItem({ product_id: 1, price: 100, on_sale: true }),
					createItem({ product_id: 2, price: 60, on_sale: false }),
				];

				const result = calculateCouponDiscount(config, items);

				// Product 1 on sale and excluded: only product 2 -> 25% of 60 = 15
				expect(result.totalDiscount).toBe(15);
				expect(result.perItem).toEqual([{ product_id: 2, discount: 15 }]);
			});

			it('should filter by product_categories inclusion', () => {
				const config = createConfig({
					discount_type: 'fixed_product',
					amount: '5',
					product_categories: [10],
				});
				const items = [
					createItem({ product_id: 1, price: 30, categories: [{ id: 10 }] }),
					createItem({ product_id: 2, price: 30, categories: [{ id: 20 }] }),
				];

				const result = calculateCouponDiscount(config, items);

				// Only product 1 is in category 10
				expect(result.totalDiscount).toBe(5);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 5 }]);
			});

			it('should exclude items by excluded_product_categories', () => {
				const config = createConfig({
					discount_type: 'fixed_product',
					amount: '5',
					excluded_product_categories: [10],
				});
				const items = [
					createItem({ product_id: 1, price: 30, categories: [{ id: 10 }] }),
					createItem({ product_id: 2, price: 30, categories: [{ id: 20 }] }),
				];

				const result = calculateCouponDiscount(config, items);

				// Product 1 in excluded category 10, only product 2 eligible
				expect(result.totalDiscount).toBe(5);
				expect(result.perItem).toEqual([{ product_id: 2, discount: 5 }]);
			});

			it('should combine multiple restrictions', () => {
				const config = createConfig({
					discount_type: 'percent',
					amount: '50',
					product_ids: [1, 2, 3],
					excluded_product_ids: [2],
					exclude_sale_items: true,
				});
				const items = [
					createItem({ product_id: 1, price: 100, on_sale: false }),
					createItem({ product_id: 2, price: 80, on_sale: false }), // excluded by ID
					createItem({ product_id: 3, price: 60, on_sale: true }), // excluded as sale item
					createItem({ product_id: 4, price: 40, on_sale: false }), // not in product_ids
				];

				const result = calculateCouponDiscount(config, items);

				// Only product 1 passes all filters: 50% of 100 = 50
				expect(result.totalDiscount).toBe(50);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 50 }]);
			});
		});
	});
});
