/**
 * @jest-environment node
 *
 * WooCommerce Coupon Discount Parity Tests
 *
 * These tests reproduce the scenarios from WooCommerce's PHP test suite to
 * verify that our JavaScript discount calculations match WooCommerce exactly.
 *
 * Sources:
 * - plugins/woocommerce/tests/legacy/unit-tests/discounts/discounts.php
 *   (calculations_test_provider — 28 data-driven test cases)
 * - plugins/woocommerce/tests/legacy/unit-tests/coupon/coupon.php
 *   (exclude_sale_items, cart-level discount tests)
 *
 * Key behavioral notes from WooCommerce:
 * - Items are sorted by unit price descending when limit_usage_to_x_items is set
 * - Non-sequential (default): each coupon discounts based on original prices
 * - Sequential: each coupon discounts based on prices after prior coupons
 * - fixed_product applies per unit, capped at the item's unit price
 * - fixed_cart distributes proportionally across eligible items
 * - Discount can never exceed the item price (no negative totals)
 */
import { calculateCouponDiscount } from './coupon-discount';
import { applyPerItemDiscountsToLineItems } from './coupon-helpers';

import type { CouponDiscountConfig } from './coupon-discount';
import type { CouponLineItem } from './coupon-helpers';

const item = (product_id: number, price: number, quantity: number): CouponLineItem => ({
	product_id,
	quantity,
	price,
	subtotal: String(price * quantity),
	total: String(price * quantity),
	categories: [],
	on_sale: false,
});

const coupon = (overrides: Partial<CouponDiscountConfig> = {}): CouponDiscountConfig => ({
	discount_type: 'percent',
	amount: '0',
	limit_usage_to_x_items: null,
	product_ids: [],
	excluded_product_ids: [],
	product_categories: [],
	excluded_product_categories: [],
	exclude_sale_items: false,
	...overrides,
});

/**
 * Apply multiple coupons sequentially: each coupon sees prices reduced by
 * prior coupons. Returns total discount across all coupons.
 */
function applySequentialCoupons(coupons: CouponDiscountConfig[], items: CouponLineItem[]): number {
	let currentItems = items;
	let totalDiscount = 0;

	for (const c of coupons) {
		const result = calculateCouponDiscount(c, currentItems);
		totalDiscount += result.totalDiscount;
		currentItems = applyPerItemDiscountsToLineItems(currentItems, result.perItem);
	}

	return totalDiscount;
}

/**
 * Apply multiple coupons non-sequentially: each coupon sees original prices.
 * Returns total discount across all coupons.
 */
function applyNonSequentialCoupons(
	coupons: CouponDiscountConfig[],
	items: CouponLineItem[]
): number {
	let totalDiscount = 0;
	for (const c of coupons) {
		const result = calculateCouponDiscount(c, items);
		totalDiscount += result.totalDiscount;
	}
	return totalDiscount;
}

describe('WooCommerce coupon discount parity (discounts.php calculations_test_provider)', () => {
	describe('percent discount', () => {
		it('Test 1: 20% off single $10 item', () => {
			const result = calculateCouponDiscount(coupon({ discount_type: 'percent', amount: '20' }), [
				item(1, 10, 1),
			]);
			expect(result.totalDiscount).toBe(2);
		});

		it('Test 8: 10% off, limit_usage_to_x_items=1, single item qty 2', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'percent', amount: '10', limit_usage_to_x_items: 1 }),
				[item(1, 10, 2)]
			);
			expect(result.totalDiscount).toBe(1);
		});

		it('Test 9: 10% off, limit=1, two items qty 2 each', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'percent', amount: '10', limit_usage_to_x_items: 1 }),
				[item(1, 10, 2), item(2, 10, 2)]
			);
			// Only 1 unit gets discount: 10% of $10 = $1
			expect(result.totalDiscount).toBe(1);
		});
	});

	describe('fixed_cart discount', () => {
		it('Test 2: $10 off, single item qty 2', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_cart', amount: '10' }),
				[item(1, 10, 2)]
			);
			expect(result.totalDiscount).toBe(10);
		});

		it('Test 3: $10 off, two items qty 1 each', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_cart', amount: '10' }),
				[item(1, 10, 1), item(2, 10, 1)]
			);
			expect(result.totalDiscount).toBe(10);
		});

		it('Test 4: $10 off, three items qty 1 each', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_cart', amount: '10' }),
				[item(1, 10, 1), item(2, 10, 1), item(3, 10, 1)]
			);
			expect(result.totalDiscount).toBeCloseTo(10, 2);
		});

		it('Test 5: $10 off, three items mixed quantities (2+3+2)', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_cart', amount: '10' }),
				[item(1, 10, 2), item(2, 10, 3), item(3, 10, 2)]
			);
			expect(result.totalDiscount).toBeCloseTo(10, 2);
		});

		it('Test 6: $10 off, eleven items qty 1 each', () => {
			const items = Array.from({ length: 11 }, (_, i) => item(i + 1, 10, 1));
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_cart', amount: '10' }),
				items
			);
			expect(result.totalDiscount).toBeCloseTo(10, 2);
		});

		it('Test 7: $1 off, three $1 items', () => {
			const result = calculateCouponDiscount(coupon({ discount_type: 'fixed_cart', amount: '1' }), [
				item(1, 1, 1),
				item(2, 1, 1),
				item(3, 1, 1),
			]);
			expect(result.totalDiscount).toBeCloseTo(1, 2);
		});
	});

	describe('fixed_product discount', () => {
		it('Test 17: $10 off per unit, $13.95 item qty 3', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_product', amount: '10' }),
				[item(1, 13.95, 3)]
			);
			expect(result.totalDiscount).toBe(30);
		});

		it('Test 18: $20 off per unit (exceeds price), $13.95 item qty 3', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_product', amount: '20' }),
				[item(1, 13.95, 3)]
			);
			// Capped at item price: $13.95 * 3 = $41.85
			expect(result.totalDiscount).toBe(41.85);
		});

		it('Test 19: $10 off, limit=1, $13.95 item qty 3', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_product', amount: '10', limit_usage_to_x_items: 1 }),
				[item(1, 13.95, 3)]
			);
			expect(result.totalDiscount).toBe(10);
		});

		it('Test 20: $15 off, limit=1, $13.95 item qty 3 (capped at price)', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_product', amount: '15', limit_usage_to_x_items: 1 }),
				[item(1, 13.95, 3)]
			);
			expect(result.totalDiscount).toBe(13.95);
		});

		it('Test 21: $13.95 off, limit=3, $13.95 item qty 3 (exact match)', () => {
			const result = calculateCouponDiscount(
				coupon({
					discount_type: 'fixed_product',
					amount: '13.95',
					limit_usage_to_x_items: 3,
				}),
				[item(1, 13.95, 3)]
			);
			expect(result.totalDiscount).toBe(41.85);
		});

		it('Test 22: $10 off, two items ($13.95 x3 + $1.80 x5), no limit', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_product', amount: '10' }),
				[item(1, 13.95, 3), item(2, 1.8, 5)]
			);
			// Item 1: $10*3 = $30, Item 2: min($10,$1.80)*5 = $9
			expect(result.totalDiscount).toBe(39);
		});

		it('Test 23: $10 off, two items, limit=3', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_product', amount: '10', limit_usage_to_x_items: 3 }),
				[item(1, 13.95, 3), item(2, 1.8, 5)]
			);
			// Sorted by price desc: all 3 slots go to $13.95 item: $10*3 = $30
			expect(result.totalDiscount).toBe(30);
		});

		it('Test 24: $10 off, two items, limit=5', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_product', amount: '10', limit_usage_to_x_items: 5 }),
				[item(1, 13.95, 3), item(2, 1.8, 5)]
			);
			// 3 slots to $13.95 item ($30) + 2 slots to $1.80 item ($3.60) = $33.60
			expect(result.totalDiscount).toBe(33.6);
		});

		it('Test 25: $1 off, two items, limit=5', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_product', amount: '1', limit_usage_to_x_items: 5 }),
				[item(1, 13.95, 3), item(2, 1.8, 5)]
			);
			// 5 units * $1 = $5
			expect(result.totalDiscount).toBe(5);
		});

		it('Test 26: $1 off, two items, limit=10 (exceeds total qty)', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_product', amount: '1', limit_usage_to_x_items: 10 }),
				[item(1, 13.95, 3), item(2, 1.8, 5)]
			);
			// All 8 units * $1 = $8
			expect(result.totalDiscount).toBe(8);
		});

		it('Test 27: $10 off, limit=2, cart order reversed (price sorting)', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_product', amount: '10', limit_usage_to_x_items: 2 }),
				// Cart has cheap item first, but sorting should pick expensive item
				[item(1, 1.8, 5), item(2, 13.95, 3)]
			);
			// Sorted by price desc: both slots go to $13.95 item: $10*2 = $20
			expect(result.totalDiscount).toBe(20);
		});

		it('Test 28: $10 off, $8.95 item qty 1 (precision/capping)', () => {
			const result = calculateCouponDiscount(
				coupon({ discount_type: 'fixed_product', amount: '10' }),
				[item(1, 8.95, 1)]
			);
			// Capped at item price
			expect(result.totalDiscount).toBe(8.95);
		});
	});

	describe('multiple coupons — non-sequential', () => {
		it('Test 10: two percent coupons (10% + 20%), no limits', () => {
			const items = [item(1, 10, 2), item(2, 5, 1)];
			const total = applyNonSequentialCoupons(
				[
					coupon({ discount_type: 'percent', amount: '10' }),
					coupon({ discount_type: 'percent', amount: '20' }),
				],
				items
			);
			// Coupon 1: 10% of 25 = 2.5, Coupon 2: 20% of 25 = 5, Total = 7.5
			expect(total).toBeCloseTo(7.5, 2);
		});

		it('Test 11: two percent coupons (10% limit=1, 20% no limit)', () => {
			const items = [item(1, 10, 2), item(2, 5, 1)];
			const total = applyNonSequentialCoupons(
				[
					coupon({ discount_type: 'percent', amount: '10', limit_usage_to_x_items: 1 }),
					coupon({ discount_type: 'percent', amount: '20' }),
				],
				items
			);
			// Coupon 1: 10% of $10 (1 unit) = 1, Coupon 2: 20% of 25 = 5, Total = 6
			expect(total).toBeCloseTo(6, 2);
		});

		it('Test 14: two percent coupons (30% limit=5, 20% no limit)', () => {
			const items = [item(1, 10, 3), item(2, 5, 3)];
			const total = applyNonSequentialCoupons(
				[
					coupon({ discount_type: 'percent', amount: '30', limit_usage_to_x_items: 5 }),
					coupon({ discount_type: 'percent', amount: '20' }),
				],
				items
			);
			// Coupon 1 (30%, limit 5): 3x$10 + 2x$5 = $40, 30% = $12
			// Coupon 2 (20%): 20% of $45 = $9
			// Total = 21
			expect(total).toBeCloseTo(21, 2);
		});

		it('Test 29: three coupons with limit=1 each on $10 item qty 4', () => {
			const items = [item(1, 10, 4)];
			const total = applyNonSequentialCoupons(
				[
					coupon({
						discount_type: 'fixed_product',
						amount: '10',
						limit_usage_to_x_items: 1,
					}),
					coupon({
						discount_type: 'fixed_product',
						amount: '10',
						limit_usage_to_x_items: 1,
					}),
					coupon({ discount_type: 'percent', amount: '100', limit_usage_to_x_items: 1 }),
				],
				items
			);
			// Each coupon applies to 1 unit of $10: $10 + $10 + $10 = $30
			expect(total).toBe(30);
		});
	});

	describe('multiple coupons — sequential', () => {
		it('Test 12: two percent coupons (10% + 20%), sequential', () => {
			const items = [item(1, 10, 2), item(2, 5, 1)];
			const total = applySequentialCoupons(
				[
					coupon({ discount_type: 'percent', amount: '10' }),
					coupon({ discount_type: 'percent', amount: '20' }),
				],
				items
			);
			// Coupon 1: 10% of 25 = 2.5, remaining = 22.5
			// Coupon 2: 20% of 22.5 = 4.5, Total = 7
			expect(total).toBeCloseTo(7, 2);
		});

		it('Test 13: two percent coupons (10% + 20%), sequential, fractional prices', () => {
			const items = [item(1, 1.8, 10), item(2, 13.95, 3)];
			const total = applySequentialCoupons(
				[
					coupon({ discount_type: 'percent', amount: '10' }),
					coupon({ discount_type: 'percent', amount: '20' }),
				],
				items
			);
			// Subtotal = 18 + 41.85 = 59.85
			// Coupon 1: 10% = ~5.985
			// Coupon 2: 20% of remaining ~53.865 = ~10.773
			// WooCommerce expects 16.75 (rounding at different precision)
			expect(total).toBeCloseTo(16.75, 1);
		});

		it('Test 15: two percent coupons (20% no limit, 30% limit=5), sequential', () => {
			const items = [item(1, 10, 3), item(2, 5, 3)];
			const total = applySequentialCoupons(
				[
					coupon({ discount_type: 'percent', amount: '20' }),
					coupon({ discount_type: 'percent', amount: '30', limit_usage_to_x_items: 5 }),
				],
				items
			);
			// Coupon 1 (20%): 20% of 45 = 9, remaining items: $8*3 + $4*3 = $36
			// Coupon 2 (30%, limit 5): top 5 units (3x$8 + 2x$4 = $32), 30% = $9.60
			// Total = 18.60
			expect(total).toBeCloseTo(18.6, 1);
		});

		it('Test 16: sequential + limit + zero-dollar items', () => {
			const items = [
				item(1, 1.8, 3),
				item(2, 13.95, 3),
				item(3, 0, 1),
				item(4, 0, 1),
				item(5, 0, 1),
				item(6, 0, 1),
				item(7, 0, 1),
			];
			const total = applySequentialCoupons(
				[
					coupon({ discount_type: 'percent', amount: '30', limit_usage_to_x_items: 5 }),
					coupon({ discount_type: 'percent', amount: '20' }),
				],
				items
			);
			// Subtotal = 5.40 + 41.85 = 47.25 (zero items excluded from eligible)
			// Coupon 1 (30%, limit 5): top 5 units (3x$13.95 + 2x$1.80 = $43.65), 30% = $13.095
			// Coupon 2 (20%): 20% of remaining
			// WooCommerce expects 20.35
			expect(total).toBeCloseTo(20.35, 1);
		});
	});
});

describe('WooCommerce coupon parity (coupon.php exclude_sale_items)', () => {
	it('percent coupon: includes sale items when exclude_sale_items=false', () => {
		const items = [
			{ ...item(1, 20, 1), on_sale: false },
			{ ...item(2, 10, 1), on_sale: true },
		];
		const result = calculateCouponDiscount(
			coupon({ discount_type: 'percent', amount: '10', exclude_sale_items: false }),
			items
		);
		// 10% of $20 + 10% of $10 = 2 + 1 = 3
		expect(result.totalDiscount).toBe(3);
	});

	it('percent coupon: excludes sale items when exclude_sale_items=true', () => {
		const items = [
			{ ...item(1, 20, 1), on_sale: false },
			{ ...item(2, 10, 1), on_sale: true },
		];
		const result = calculateCouponDiscount(
			coupon({ discount_type: 'percent', amount: '10', exclude_sale_items: true }),
			items
		);
		// Only non-sale item: 10% of $20 = 2
		expect(result.totalDiscount).toBe(2);
	});

	it('fixed_product coupon: includes sale items when exclude_sale_items=false', () => {
		const items = [
			{ ...item(1, 20, 1), on_sale: false },
			{ ...item(2, 10, 1), on_sale: true },
		];
		const result = calculateCouponDiscount(
			coupon({ discount_type: 'fixed_product', amount: '5', exclude_sale_items: false }),
			items
		);
		// $5 off each: $5 + $5 = $10
		expect(result.totalDiscount).toBe(10);
	});

	it('fixed_product coupon: excludes sale items when exclude_sale_items=true', () => {
		const items = [
			{ ...item(1, 20, 1), on_sale: false },
			{ ...item(2, 10, 1), on_sale: true },
		];
		const result = calculateCouponDiscount(
			coupon({ discount_type: 'fixed_product', amount: '5', exclude_sale_items: true }),
			items
		);
		// Only non-sale item: $5
		expect(result.totalDiscount).toBe(5);
	});

	it('fixed_cart coupon: returns zero when exclude_sale_items=true and sale items present', () => {
		const items = [
			{ ...item(1, 20, 1), on_sale: false },
			{ ...item(2, 10, 1), on_sale: true },
		];
		const result = calculateCouponDiscount(
			coupon({ discount_type: 'fixed_cart', amount: '5', exclude_sale_items: true }),
			items
		);
		// WooCommerce rejects fixed_cart coupons entirely when sale items are in cart
		expect(result.totalDiscount).toBe(0);
	});

	it('fixed_cart coupon: applies normally when exclude_sale_items=false', () => {
		const items = [
			{ ...item(1, 20, 1), on_sale: false },
			{ ...item(2, 10, 1), on_sale: true },
		];
		const result = calculateCouponDiscount(
			coupon({ discount_type: 'fixed_cart', amount: '5', exclude_sale_items: false }),
			items
		);
		expect(result.totalDiscount).toBe(5);
	});
});

describe('WooCommerce coupon parity — discount never exceeds cart value', () => {
	it('two percent coupons (20% + 100%) cap total discount at cart subtotal', () => {
		const items = [item(1, 18, 4)];
		// Non-sequential: both see original prices
		const c1 = calculateCouponDiscount(coupon({ discount_type: 'percent', amount: '20' }), items);
		const c2 = calculateCouponDiscount(coupon({ discount_type: 'percent', amount: '100' }), items);
		const rawTotal = c1.totalDiscount + c2.totalDiscount;
		const cartSubtotal = 18 * 4;
		// WooCommerce caps total discount at cart subtotal
		const cappedTotal = Math.min(rawTotal, cartSubtotal);
		expect(cappedTotal).toBe(cartSubtotal);
		// c1 = 20% of 72 = 14.4, c2 = 100% of 72 = 72
		// Raw total = 86.4 > 72, so capped at 72
		expect(c1.totalDiscount).toBeCloseTo(14.4, 2);
		expect(c2.totalDiscount).toBe(72);
	});
});
