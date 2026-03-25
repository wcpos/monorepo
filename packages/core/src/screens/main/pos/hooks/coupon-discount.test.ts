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
				const config = createConfig({
					discount_type: 'percent',
					amount: '100',
				});
				const items = [createItem({ product_id: 1, price: 75, quantity: 2 })];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBe(150);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 150 }]);
			});

			it('should cap discount at item total (percent > 100 does not go negative)', () => {
				const config = createConfig({
					discount_type: 'percent',
					amount: '150',
				});
				const items = [createItem({ product_id: 1, price: 40, quantity: 1 })];

				const result = calculateCouponDiscount(config, items);

				// 150% of 40 = 60, but capped at 40
				expect(result.totalDiscount).toBe(40);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 40 }]);
			});
		});

		describe('fixed cart discount', () => {
			it('should distribute $10 evenly per-unit across $60 + $40 items (WC behavior)', () => {
				const config = createConfig({
					discount_type: 'fixed_cart',
					amount: '10',
				});
				const items = [
					createItem({ product_id: 1, price: 60, quantity: 1 }),
					createItem({ product_id: 2, price: 40, quantity: 1 }),
				];

				const result = calculateCouponDiscount(config, items);

				// WC: floor(1000 cents / 2 units) = 500 cents per unit = $5 each
				expect(result.totalDiscount).toBe(10);
				expect(result.perItem).toEqual([
					{ product_id: 1, discount: 5 },
					{ product_id: 2, discount: 5 },
				]);
			});

			it('should cap at cart total when coupon exceeds cart value', () => {
				const config = createConfig({
					discount_type: 'fixed_cart',
					amount: '500',
				});
				const items = [createItem({ product_id: 1, price: 100, quantity: 1 })];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBe(100);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 100 }]);
			});

			it('should handle rounding residuals via penny distribution (WC behavior)', () => {
				const config = createConfig({
					discount_type: 'fixed_cart',
					amount: '10',
				});
				// Three items at $33.33 each = $99.99 total
				const items = [
					createItem({ product_id: 1, price: 33.33, quantity: 1 }),
					createItem({ product_id: 2, price: 33.33, quantity: 1 }),
					createItem({ product_id: 3, price: 33.33, quantity: 1 }),
				];

				const result = calculateCouponDiscount(config, items);

				// WC: floor(1000/3) = 333 cents each, total 999, remainder 1 cent
				// Penny goes to first item (most expensive, all same price)
				expect(result.perItem[0].discount).toBe(3.34);
				expect(result.perItem[1].discount).toBe(3.33);
				expect(result.perItem[2].discount).toBe(3.33);
				expect(result.totalDiscount).toBe(10);
			});

			it('should handle a single item in cart', () => {
				const config = createConfig({
					discount_type: 'fixed_cart',
					amount: '15',
				});
				const items = [createItem({ product_id: 1, price: 80, quantity: 1 })];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBe(15);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 15 }]);
			});

			it('should handle items with quantity > 1', () => {
				const config = createConfig({
					discount_type: 'fixed_cart',
					amount: '20',
				});
				const items = [createItem({ product_id: 1, price: 50, quantity: 2 })];

				const result = calculateCouponDiscount(config, items);

				// Cart total = 100, discount = 20
				expect(result.totalDiscount).toBe(20);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 20 }]);
			});

			it('should split $1 across 3 items at $1 each (Woo rounding edge case)', () => {
				const config = createConfig({
					discount_type: 'fixed_cart',
					amount: '1',
				});
				const items = [
					createItem({ product_id: 1, price: 1, quantity: 1 }),
					createItem({ product_id: 2, price: 1, quantity: 1 }),
					createItem({ product_id: 3, price: 1, quantity: 1 }),
				];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBeCloseTo(1, 2);
				expect(result.perItem).toHaveLength(3);
				const sum = result.perItem.reduce((s, p) => s + p.discount, 0);
				expect(sum).toBeCloseTo(1, 5);
			});

			it('should split $10 across 11 items at $10 each', () => {
				const config = createConfig({
					discount_type: 'fixed_cart',
					amount: '10',
				});
				const items = Array.from({ length: 11 }, (_, i) =>
					createItem({ product_id: i + 1, price: 10, quantity: 1 })
				);

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBeCloseTo(10, 2);
				expect(result.perItem).toHaveLength(11);
			});

			it('should split $5 across items with different quantities (2+3+2)', () => {
				const config = createConfig({
					discount_type: 'fixed_cart',
					amount: '5',
				});
				const items = [
					createItem({ product_id: 1, price: 10, quantity: 2 }),
					createItem({ product_id: 2, price: 10, quantity: 3 }),
					createItem({ product_id: 3, price: 10, quantity: 2 }),
				];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBeCloseTo(5, 2);
				expect(result.perItem).toHaveLength(3);
			});

			it('should handle mixed $13.95 x3 + $1.80 x5 items', () => {
				const config = createConfig({
					discount_type: 'fixed_cart',
					amount: '10',
				});
				const items = [
					createItem({ product_id: 1, price: 13.95, quantity: 3 }),
					createItem({ product_id: 2, price: 1.8, quantity: 5 }),
				];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBeCloseTo(10, 2);
				expect(result.perItem).toHaveLength(2);
			});

			it('should handle zero-dollar items mixed with normal items (WC filters zero-price)', () => {
				const config = createConfig({
					discount_type: 'fixed_cart',
					amount: '5',
				});
				const items = [
					createItem({ product_id: 1, price: 0, quantity: 1 }),
					createItem({ product_id: 2, price: 20, quantity: 1 }),
					createItem({ product_id: 3, price: 30, quantity: 1 }),
				];

				const result = calculateCouponDiscount(config, items);

				// WC: zero-price items filtered out, count=2
				// floor(500/2) = 250 each = $2.50 + $2.50
				expect(result.totalDiscount).toBe(5);
				expect(result.perItem).toEqual([
					{ product_id: 2, discount: 2.5 },
					{ product_id: 3, discount: 2.5 },
				]);
			});
		});

		describe('fixed product discount', () => {
			it('should apply $5 per unit across 3 units', () => {
				const config = createConfig({
					discount_type: 'fixed_product',
					amount: '5',
				});
				const items = [createItem({ product_id: 1, price: 20, quantity: 3 })];

				const result = calculateCouponDiscount(config, items);

				expect(result.totalDiscount).toBe(15);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 15 }]);
			});

			it('should cap per-unit discount at item price', () => {
				const config = createConfig({
					discount_type: 'fixed_product',
					amount: '200',
				});
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
				const config = createConfig({
					discount_type: 'fixed_product',
					amount: '10',
				});
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

			it('should limit to top N most expensive units with limit_usage_to_x_items', () => {
				const config = createConfig({
					discount_type: 'fixed_product',
					amount: '10',
					limit_usage_to_x_items: 1,
				});
				const items = [
					createItem({ product_id: 1, price: 50, quantity: 1 }),
					createItem({ product_id: 2, price: 30, quantity: 1 }),
				];

				const result = calculateCouponDiscount(config, items);

				// Only 1 unit gets discount — the $50 one (most expensive)
				expect(result.totalDiscount).toBe(10);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 10 }]);
			});

			it('should limit across expanded quantities', () => {
				const config = createConfig({
					discount_type: 'fixed_product',
					amount: '5',
					limit_usage_to_x_items: 1,
				});
				// 3 units at $20, but only 1 should get the discount
				const items = [createItem({ product_id: 1, price: 20, quantity: 3 })];

				const result = calculateCouponDiscount(config, items);

				// $5 * 1 unit = $5
				expect(result.totalDiscount).toBe(5);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 5 }]);
			});

			it('should limit of 5 across products with quantities 3+5', () => {
				const config = createConfig({
					discount_type: 'fixed_product',
					amount: '10',
					limit_usage_to_x_items: 5,
				});
				const items = [
					createItem({ product_id: 1, price: 13.95, quantity: 3 }),
					createItem({ product_id: 2, price: 1.8, quantity: 5 }),
				];

				const result = calculateCouponDiscount(config, items);

				// 5 most expensive units: all 3 of product 1 ($13.95) + 2 of product 2 ($1.80)
				// Product 1: $10 * 3 = $30
				// Product 2: $1.80 (capped) * 2 = $3.60
				expect(result.perItem).toEqual([
					{ product_id: 1, discount: 30 },
					{ product_id: 2, discount: 3.6 },
				]);
				expect(result.totalDiscount).toBe(33.6);
			});

			it('should apply to all units when limit >= total quantity', () => {
				const config = createConfig({
					discount_type: 'fixed_product',
					amount: '5',
					limit_usage_to_x_items: 10,
				});
				const items = [
					createItem({ product_id: 1, price: 20, quantity: 2 }),
					createItem({ product_id: 2, price: 15, quantity: 1 }),
				];

				const result = calculateCouponDiscount(config, items);

				// All 3 units get the discount: $5*2 + $5*1 = $15
				expect(result.totalDiscount).toBe(15);
			});

			it('should still work with null limit (no restriction)', () => {
				const config = createConfig({
					discount_type: 'fixed_product',
					amount: '5',
					limit_usage_to_x_items: null,
				});
				const items = [createItem({ product_id: 1, price: 20, quantity: 3 })];

				const result = calculateCouponDiscount(config, items);

				// All 3 units: $5 * 3 = $15
				expect(result.totalDiscount).toBe(15);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 15 }]);
			});

			it('should handle $20 coupon on $13.95 item x3 (caps at item price)', () => {
				const config = createConfig({
					discount_type: 'fixed_product',
					amount: '20',
				});
				const items = [createItem({ product_id: 1, price: 13.95, quantity: 3 })];

				const result = calculateCouponDiscount(config, items);

				// $20 per unit capped at $13.95 per unit -> $13.95 * 3 = $41.85
				expect(result.totalDiscount).toBe(41.85);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 41.85 }]);
			});

			it('should handle coupon on $8.95 items (precision edge case)', () => {
				const config = createConfig({
					discount_type: 'fixed_product',
					amount: '10',
				});
				const items = [createItem({ product_id: 1, price: 8.95, quantity: 2 })];

				const result = calculateCouponDiscount(config, items);

				// $10 per unit capped at $8.95 -> $8.95 * 2 = $17.90
				expect(result.totalDiscount).toBe(17.9);
				expect(result.perItem).toEqual([{ product_id: 1, discount: 17.9 }]);
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
				const config = createConfig({
					discount_type: 'fixed_cart',
					amount: '10',
				});
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

		describe('dp parameter (price_num_decimals)', () => {
			describe('dp=0 (JPY)', () => {
				it('percent: 10% off ¥1000', () => {
					const config = createConfig({ discount_type: 'percent', amount: '10' });
					const items = [createItem({ product_id: 1, price: 1000, quantity: 1 })];

					const result = calculateCouponDiscount(config, items, 0);

					// floor(1000 * 10/100) = 100
					expect(result.totalDiscount).toBe(100);
					expect(result.perItem).toEqual([{ product_id: 1, discount: 100 }]);
				});

				it('percent: 33% off ¥100 (remainder distribution)', () => {
					const config = createConfig({ discount_type: 'percent', amount: '33' });
					const items = [
						createItem({ product_id: 1, price: 50, quantity: 1 }),
						createItem({ product_id: 2, price: 50, quantity: 1 }),
					];

					const result = calculateCouponDiscount(config, items, 0);

					// floor(50 * 33/100) = floor(16.5) = 16 each
					// exact total = 100 * 0.33 = 33, floor'd total = 32, remainder = 1
					// penny goes to first (most expensive, both same so first)
					expect(result.perItem[0].discount).toBe(17);
					expect(result.perItem[1].discount).toBe(16);
					expect(result.totalDiscount).toBe(33);
				});

				it('fixed_cart: ¥100 across 3 items', () => {
					const config = createConfig({ discount_type: 'fixed_cart', amount: '100' });
					const items = [
						createItem({ product_id: 1, price: 500, quantity: 1 }),
						createItem({ product_id: 2, price: 500, quantity: 1 }),
						createItem({ product_id: 3, price: 500, quantity: 1 }),
					];

					const result = calculateCouponDiscount(config, items, 0);

					// floor(100/3) = 33 each, total 99, remainder 1
					// penny to first item (most expensive, all same)
					expect(result.perItem[0].discount).toBe(34);
					expect(result.perItem[1].discount).toBe(33);
					expect(result.perItem[2].discount).toBe(33);
					expect(result.totalDiscount).toBe(100);
				});

				it('fixed_product: ¥200 off ¥150 item (caps at price)', () => {
					const config = createConfig({ discount_type: 'fixed_product', amount: '200' });
					const items = [createItem({ product_id: 1, price: 150, quantity: 2 })];

					const result = calculateCouponDiscount(config, items, 0);

					// min(200, 150) = 150 per unit, floor(150*2) = 300
					expect(result.totalDiscount).toBe(300);
				});
			});

			describe('dp=3', () => {
				it('percent: 10% off $9.999', () => {
					const config = createConfig({ discount_type: 'percent', amount: '10' });
					const items = [createItem({ product_id: 1, price: 9.999, quantity: 1 })];

					const result = calculateCouponDiscount(config, items, 3);

					// floor(9999 * 10/100) = 999, exact=999.9
					// roundDiscount(999.9, 0) = 1000, remainder=1
					// after penny distribution: 1000 → removeNumberPrecision(1000, 3) = 1
					expect(result.totalDiscount).toBe(1);
					expect(result.perItem).toEqual([{ product_id: 1, discount: 1 }]);
				});

				it('fixed_cart: $1 across 3 items at $3.333 each', () => {
					const config = createConfig({ discount_type: 'fixed_cart', amount: '1' });
					const items = [
						createItem({ product_id: 1, price: 3.333, quantity: 1 }),
						createItem({ product_id: 2, price: 3.333, quantity: 1 }),
						createItem({ product_id: 3, price: 3.333, quantity: 1 }),
					];

					const result = calculateCouponDiscount(config, items, 3);

					// addNumberPrecision(1, 3) = 1000
					// floor(1000/3) = 333 each, total 999, remainder 1
					// penny to first item
					expect(result.perItem[0].discount).toBe(0.334);
					expect(result.perItem[1].discount).toBe(0.333);
					expect(result.perItem[2].discount).toBe(0.333);
					expect(result.totalDiscount).toBe(1);
				});

				it('fixed_product: $0.5 off $0.999 item x3', () => {
					const config = createConfig({ discount_type: 'fixed_product', amount: '0.5' });
					const items = [createItem({ product_id: 1, price: 0.999, quantity: 3 })];

					const result = calculateCouponDiscount(config, items, 3);

					// addNumberPrecision(0.5, 3) = 500
					// addNumberPrecision(0.999, 3) = 999
					// min(500, 999) = 500, floor(500*3) = 1500
					// removeNumberPrecision(1500, 3) = 1.5
					expect(result.totalDiscount).toBe(1.5);
				});
			});

			describe('dp=4', () => {
				it('percent: 15% off $99.9999', () => {
					const config = createConfig({ discount_type: 'percent', amount: '15' });
					const items = [createItem({ product_id: 1, price: 99.9999, quantity: 1 })];

					const result = calculateCouponDiscount(config, items, 4);

					// floor(999999 * 15/100) = 149999, exact=149999.85
					// roundDiscount(149999.85, 0) = 150000, remainder=1
					// after penny distribution: 150000 → removeNumberPrecision(150000, 4) = 15
					expect(result.totalDiscount).toBe(15);
				});

				it('fixed_cart: $10 across 2 items', () => {
					const config = createConfig({ discount_type: 'fixed_cart', amount: '10' });
					const items = [
						createItem({ product_id: 1, price: 50, quantity: 1 }),
						createItem({ product_id: 2, price: 30, quantity: 1 }),
					];

					const result = calculateCouponDiscount(config, items, 4);

					// addNumberPrecision(10, 4) = 100000
					// floor(100000/2) = 50000 each
					// removeNumberPrecision(50000, 4) = 5 each
					expect(result.perItem).toEqual([
						{ product_id: 1, discount: 5 },
						{ product_id: 2, discount: 5 },
					]);
					expect(result.totalDiscount).toBe(10);
				});
			});
		});
	});
});

/**
 * Parity regression tests — specific WooCommerce behaviors discovered during
 * integration testing that differ from naive expectations.
 */
describe('coupon-discount — parity regressions', () => {
	describe('fixed_cart bypasses product_categories filter (WC parity)', () => {
		// WC's get_items_to_apply_coupon() has: !is_valid_for_product() && !is_valid_for_cart()
		// For fixed_cart, is_valid_for_cart() returns true, so ALL items pass regardless
		// of category restrictions. Categories only affect validation (can coupon be used?).
		const musicCategoryId = 42;
		const clothingCategoryId = 15;

		it('distributes fixed_cart across ALL items, not just category-matching ones', () => {
			const config = createConfig({
				discount_type: 'fixed_cart',
				amount: '10',
				product_categories: [musicCategoryId],
			});

			const items = [
				createItem({
					product_id: 1,
					price: 18,
					quantity: 1,
					categories: [{ id: clothingCategoryId }], // NOT in music
				}),
				createItem({
					product_id: 2,
					price: 2,
					quantity: 1,
					categories: [{ id: musicCategoryId }], // In music — validates the coupon
				}),
			];

			const result = calculateCouponDiscount(config, items);

			// WC distributes $10 across BOTH items: floor(1000/2) = 500 cents each,
			// but item 2 ($2) caps at 200, remainder (300) flows to item 1.
			// Result: item 1 = $8, item 2 = $2.
			expect(result.totalDiscount).toBe(10);
			expect(result.perItem).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ product_id: 1, discount: 8 }),
					expect.objectContaining({ product_id: 2, discount: 2 }),
				])
			);
		});

		it('still rejects fixed_cart when NO items match categories', () => {
			const config = createConfig({
				discount_type: 'fixed_cart',
				amount: '10',
				product_categories: [musicCategoryId],
			});

			const items = [
				createItem({
					product_id: 1,
					price: 18,
					quantity: 1,
					categories: [{ id: clothingCategoryId }],
				}),
			];

			const result = calculateCouponDiscount(config, items);

			// No eligible items → coupon rejected entirely
			expect(result.totalDiscount).toBe(0);
			expect(result.perItem).toEqual([]);
		});

		it('percent coupon still filters by category (only fixed_cart bypasses)', () => {
			const config = createConfig({
				discount_type: 'percent',
				amount: '50',
				product_categories: [musicCategoryId],
			});

			const items = [
				createItem({
					product_id: 1,
					price: 18,
					quantity: 1,
					categories: [{ id: clothingCategoryId }],
				}),
				createItem({
					product_id: 2,
					price: 2,
					quantity: 1,
					categories: [{ id: musicCategoryId }],
				}),
			];

			const result = calculateCouponDiscount(config, items);

			// Only music item gets 50% discount = $1
			expect(result.totalDiscount).toBe(1);
			expect(result.perItem).toEqual([expect.objectContaining({ product_id: 2, discount: 1 })]);
		});
	});
});
