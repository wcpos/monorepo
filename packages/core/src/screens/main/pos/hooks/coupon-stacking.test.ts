/**
 * @jest-environment node
 *
 * Tests for applying multiple coupons to a cart.
 *
 * These test the orchestration pattern: calling calculateCouponDiscount for each
 * coupon in sequence and verifying the combined discount. In non-sequential mode
 * (WooCommerce default), each coupon calculates against the ORIGINAL item prices.
 */
import { calculateCouponDiscount } from './coupon-discount';

import type { CouponDiscountConfig } from './coupon-discount';
import type { CouponLineItem } from './coupon-helpers';

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

describe('coupon stacking (non-sequential)', () => {
	it('should apply two percent coupons against original prices', () => {
		const items = [createItem({ product_id: 1, price: 25, quantity: 1 })];
		const coupon1 = createConfig({ discount_type: 'percent', amount: '10' });
		const coupon2 = createConfig({ discount_type: 'percent', amount: '20' });

		// Non-sequential: both coupons calculate against original $25
		const result1 = calculateCouponDiscount(coupon1, items);
		const result2 = calculateCouponDiscount(coupon2, items);

		expect(result1.totalDiscount).toBe(2.5);
		expect(result2.totalDiscount).toBe(5);
		expect(result1.totalDiscount + result2.totalDiscount).toBe(7.5);
	});

	it('should apply percent + fixed_cart together', () => {
		const items = [
			createItem({ product_id: 1, price: 50, quantity: 1 }),
			createItem({ product_id: 2, price: 50, quantity: 1 }),
		];
		const percentCoupon = createConfig({
			discount_type: 'percent',
			amount: '10',
		});
		const fixedCartCoupon = createConfig({
			discount_type: 'fixed_cart',
			amount: '5',
		});

		const result1 = calculateCouponDiscount(percentCoupon, items);
		const result2 = calculateCouponDiscount(fixedCartCoupon, items);

		// 10% of $100 = $10, fixed $5 off $100
		expect(result1.totalDiscount).toBe(10);
		expect(result2.totalDiscount).toBe(5);
		expect(result1.totalDiscount + result2.totalDiscount).toBe(15);
	});

	it('should apply percent + fixed_product together', () => {
		const items = [createItem({ product_id: 1, price: 40, quantity: 2 })];
		const percentCoupon = createConfig({
			discount_type: 'percent',
			amount: '25',
		});
		const fixedProductCoupon = createConfig({
			discount_type: 'fixed_product',
			amount: '3',
		});

		const result1 = calculateCouponDiscount(percentCoupon, items);
		const result2 = calculateCouponDiscount(fixedProductCoupon, items);

		// 25% of $80 = $20, $3 * 2 units = $6
		expect(result1.totalDiscount).toBe(20);
		expect(result2.totalDiscount).toBe(6);
		expect(result1.totalDiscount + result2.totalDiscount).toBe(26);
	});

	it('should handle three coupons with item limits on 4x$10 items', () => {
		const items = [createItem({ product_id: 1, price: 10, quantity: 4 })];
		const coupon1 = createConfig({
			discount_type: 'fixed_product',
			amount: '10',
			limit_usage_to_x_items: 1,
		});
		const coupon2 = createConfig({
			discount_type: 'fixed_product',
			amount: '10',
			limit_usage_to_x_items: 1,
		});
		const coupon3 = createConfig({
			discount_type: 'percent',
			amount: '100',
			limit_usage_to_x_items: 1,
		});

		const result1 = calculateCouponDiscount(coupon1, items);
		const result2 = calculateCouponDiscount(coupon2, items);
		const result3 = calculateCouponDiscount(coupon3, items);

		// Each limited coupon discounts 1 unit: $10 + $10 + $10 = $30
		expect(result1.totalDiscount).toBe(10);
		expect(result2.totalDiscount).toBe(10);
		expect(result3.totalDiscount).toBe(10);
		expect(result1.totalDiscount + result2.totalDiscount + result3.totalDiscount).toBe(30);
	});
});

describe('coupon stacking (sequential)', () => {
	// Sequential mode: second coupon applies to already-discounted price.
	// Requires woocommerce_calc_discounts_sequentially setting.
	// Skipped until setting is exposed via POS settings API.

	it.skip('should apply second percent coupon to reduced price', () => {
		const items = [createItem({ product_id: 1, price: 25, quantity: 1 })];
		const coupon1 = createConfig({ discount_type: 'percent', amount: '10' });
		const coupon2 = createConfig({ discount_type: 'percent', amount: '20' });

		const result1 = calculateCouponDiscount(coupon1, items);
		// Sequential: reduce price for second coupon
		const reducedItems = items.map((item) => ({
			...item,
			price: item.price - result1.totalDiscount / item.quantity,
		}));
		const result2 = calculateCouponDiscount(coupon2, reducedItems);

		// $25 * 10% = $2.50, then $22.50 * 20% = $4.50, total = $7.00
		expect(result1.totalDiscount).toBe(2.5);
		expect(result2.totalDiscount).toBe(4.5);
		expect(result1.totalDiscount + result2.totalDiscount).toBe(7);
	});
});
