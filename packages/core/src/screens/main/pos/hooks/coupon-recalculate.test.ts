/** @jest-environment node */
/**
 * Tests for recalculateCoupons – the client-side mirror of WooCommerce's
 * recalculate_coupons() in abstract-wc-order.php.
 *
 * Key POS semantics:
 * - subtotal = price * qty, total = price * qty (subtotal matches WC sale price behavior)
 * - Coupon base is pos_data.price, NOT subtotal
 * - on_sale is determined from _woocommerce_pos_data meta (price < regular_price)
 * - Non-sequential (default): each coupon applies to the original POS price
 * - Sequential: each coupon applies to the already-discounted price
 */
import { recalculateCoupons } from './coupon-recalculate';

import type { RecalculateInput, RecalculateResult } from './coupon-recalculate';
import type { CouponDiscountConfig } from './coupon-discount';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type LineItem = RecalculateInput['lineItems'][number];
type CouponLine = RecalculateInput['couponLines'][number];

/** Create a line item with POS data meta */
const makePosLineItem = (
	productId: number,
	price: number,
	regularPrice: number,
	qty = 1,
	taxStatus = 'taxable'
): LineItem =>
	({
		product_id: productId,
		quantity: qty,
		subtotal: String(price * qty),
		subtotal_tax: '0',
		total: String(price * qty),
		total_tax: '0',
		taxes: [],
		meta_data: [
			{
				key: '_woocommerce_pos_data',
				value: JSON.stringify({
					price: String(price),
					regular_price: String(regularPrice),
					tax_status: taxStatus,
				}),
			},
		],
	}) as unknown as LineItem;

/** Create a misc product line item (product_id=0) with optional categories in pos_data */
const makeMiscLineItem = (
	price: number,
	regularPrice: number,
	categories: { id: number; name: string }[] = [],
	qty = 1,
	taxStatus = 'taxable'
): LineItem =>
	({
		product_id: 0,
		quantity: qty,
		subtotal: String(price * qty),
		subtotal_tax: '0',
		total: String(price * qty),
		total_tax: '0',
		taxes: [],
		meta_data: [
			{
				key: '_woocommerce_pos_data',
				value: JSON.stringify({
					price: String(price),
					regular_price: String(regularPrice),
					tax_status: taxStatus,
					categories,
				}),
			},
		],
	}) as unknown as LineItem;

/** Create a coupon line */
const makeCouponLine = (code: string): CouponLine =>
	({
		code,
		discount: '0',
		discount_tax: '0',
		meta_data: [],
	}) as unknown as CouponLine;

/** Create a coupon config with defaults */
const makeConfig = (overrides: Partial<CouponDiscountConfig> = {}): CouponDiscountConfig => ({
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

/** Create a full RecalculateInput with defaults */
const makeInput = (
	overrides: Partial<RecalculateInput> & {
		lineItems: LineItem[];
		couponLines: CouponLine[];
		couponConfigs: Map<string, CouponDiscountConfig>;
	}
): RecalculateInput => ({
	pricesIncludeTax: false,
	calcDiscountsSequentially: false,
	taxRates: [],
	productCategories: new Map(),
	...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('recalculateCoupons', () => {
	// -----------------------------------------------------------------------
	// Group 1: Basic coupon types (no tax, no POS discount)
	// -----------------------------------------------------------------------
	describe('basic coupon types (no tax, no POS discount)', () => {
		it('should apply a 10% percentage coupon to a $100 item', () => {
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makePosLineItem(1, 100, 100)],
					couponLines: [makeCouponLine('ten')],
					couponConfigs: new Map([['ten', makeConfig({ discount_type: 'percent', amount: '10' })]]),
				})
			);

			// 10% of $100 = $10 discount
			expect(result.couponLines[0].discount).toBe('10');
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(90, 2);
		});

		it('should apply a $5 fixed_cart coupon to a $100 item', () => {
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makePosLineItem(1, 100, 100)],
					couponLines: [makeCouponLine('five')],
					couponConfigs: new Map([
						['five', makeConfig({ discount_type: 'fixed_cart', amount: '5' })],
					]),
				})
			);

			expect(result.couponLines[0].discount).toBe('5');
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(95, 2);
		});

		it('should apply a $3 fixed_product coupon per unit, qty 2 at $50 each', () => {
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makePosLineItem(1, 50, 50, 2)],
					couponLines: [makeCouponLine('three')],
					couponConfigs: new Map([
						['three', makeConfig({ discount_type: 'fixed_product', amount: '3' })],
					]),
				})
			);

			// $3 * 2 = $6 discount, $100 - $6 = $94
			expect(result.couponLines[0].discount).toBe('6');
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(94, 2);
		});

		it('should reset totals to subtotals when no coupons are present', () => {
			// Simulate a line item where total was previously discounted (stale)
			const staleItem = makePosLineItem(1, 100, 100);
			staleItem.total = '80'; // stale coupon discount
			staleItem.subtotal = '100';

			const result = recalculateCoupons(
				makeInput({
					lineItems: [staleItem],
					couponLines: [],
					couponConfigs: new Map(),
				})
			);

			// With no coupons, total should reset to subtotal
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(100, 2);
		});
	});

	// -----------------------------------------------------------------------
	// Group 2: POS discount preservation
	// -----------------------------------------------------------------------
	describe('POS discount preservation', () => {
		it('should use POS price ($16) as coupon base, not regular ($18)', () => {
			// Cashier set price to $16 on a $18 regular item
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makePosLineItem(1, 16, 18)],
					couponLines: [makeCouponLine('ten')],
					couponConfigs: new Map([['ten', makeConfig({ discount_type: 'percent', amount: '10' })]]),
				})
			);

			// 10% of $16 = $1.60 discount
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(1.6, 2);
			// subtotal should be $16 (POS price, matching WC sale price behavior)
			expect(parseFloat(result.lineItems[0].subtotal!)).toBeCloseTo(16, 2);
			// total should be $16 (POS price) - $1.60 = $14.40
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(14.4, 2);
		});

		it('should reset total to POS price when all coupons are removed', () => {
			// POS price $16, regular $18, no coupons
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makePosLineItem(1, 16, 18)],
					couponLines: [],
					couponConfigs: new Map(),
				})
			);

			// No coupons: total resets to POS price = $16 (not regular $18)
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(16, 2);
		});

		it('should apply percentage coupon correctly to mixed items', () => {
			// Item A: $18 regular, $16 POS price
			// Item B: $20 regular, $20 POS price (no discount)
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makePosLineItem(1, 16, 18), makePosLineItem(2, 20, 20)],
					couponLines: [makeCouponLine('ten')],
					couponConfigs: new Map([['ten', makeConfig({ discount_type: 'percent', amount: '10' })]]),
				})
			);

			// 10% of $16 = $1.60, 10% of $20 = $2.00, total coupon = $3.60
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(3.6, 2);

			// Item A: subtotal=$16 (POS price), total = $16 - $1.60 = $14.40
			expect(parseFloat(result.lineItems[0].subtotal!)).toBeCloseTo(16, 2);
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(14.4, 2);

			// Item B: subtotal=$20, total = $20 (POS price) - $2.00 = $18.00
			expect(parseFloat(result.lineItems[1].subtotal!)).toBeCloseTo(20, 2);
			expect(parseFloat(result.lineItems[1].total!)).toBeCloseTo(18, 2);
		});
	});

	// -----------------------------------------------------------------------
	// Group 3: exclude_sale_items
	// -----------------------------------------------------------------------
	describe('exclude_sale_items', () => {
		it('should exclude POS-discounted item (on sale) when exclude_sale_items is true', () => {
			// pos_data price=$16, regular=$18 => on_sale = true
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makePosLineItem(1, 16, 18)],
					couponLines: [makeCouponLine('sale')],
					couponConfigs: new Map([
						[
							'sale',
							makeConfig({ discount_type: 'percent', amount: '10', exclude_sale_items: true }),
						],
					]),
				})
			);

			// Item is on sale, coupon should not apply
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(0, 2);
			// Total should stay at POS price (reset, no discount applied)
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(16, 2);
		});

		it('should NOT exclude non-discounted item when exclude_sale_items is true', () => {
			// pos_data price=$18, regular=$18 => on_sale = false
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makePosLineItem(1, 18, 18)],
					couponLines: [makeCouponLine('sale')],
					couponConfigs: new Map([
						[
							'sale',
							makeConfig({ discount_type: 'percent', amount: '10', exclude_sale_items: true }),
						],
					]),
				})
			);

			// 10% of $18 = $1.80
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(1.8, 2);
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(16.2, 2);
		});
	});

	// -----------------------------------------------------------------------
	// Group 4: Non-sequential stacking (default)
	// -----------------------------------------------------------------------
	describe('non-sequential stacking (default)', () => {
		it('should apply two percentage coupons against the original POS price', () => {
			// Item $16, 10% + 5% both against $16
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makePosLineItem(1, 16, 16)],
					couponLines: [makeCouponLine('ten'), makeCouponLine('five')],
					couponConfigs: new Map([
						['ten', makeConfig({ discount_type: 'percent', amount: '10' })],
						['five', makeConfig({ discount_type: 'percent', amount: '5' })],
					]),
				})
			);

			// 10% of $16 = $1.60
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(1.6, 2);
			// 5% of $16 = $0.80
			expect(parseFloat(result.couponLines[1].discount!)).toBeCloseTo(0.8, 2);
			// Total = $16 - $1.60 - $0.80 = $13.60
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(13.6, 2);
		});

		it('should apply percentage + fixed_product against original POS price', () => {
			// Item $16, 10% coupon + $3 fixed_product
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makePosLineItem(1, 16, 16)],
					couponLines: [makeCouponLine('ten'), makeCouponLine('fixed')],
					couponConfigs: new Map([
						['ten', makeConfig({ discount_type: 'percent', amount: '10' })],
						['fixed', makeConfig({ discount_type: 'fixed_product', amount: '3' })],
					]),
				})
			);

			// 10% of $16 = $1.60
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(1.6, 2);
			// $3 fixed_product
			expect(parseFloat(result.couponLines[1].discount!)).toBeCloseTo(3, 2);
			// Total = $16 - $1.60 - $3 = $11.40
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(11.4, 2);
		});
	});

	// -----------------------------------------------------------------------
	// Group 5: Sequential stacking
	// -----------------------------------------------------------------------
	describe('sequential stacking', () => {
		it('should apply two percentage coupons sequentially against reduced prices', () => {
			// Item $16, first 10% of $16 = $1.60 → remaining $14.40
			// Then 5% of $14.40 = $0.72
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makePosLineItem(1, 16, 16)],
					couponLines: [makeCouponLine('ten'), makeCouponLine('five')],
					couponConfigs: new Map([
						['ten', makeConfig({ discount_type: 'percent', amount: '10' })],
						['five', makeConfig({ discount_type: 'percent', amount: '5' })],
					]),
					calcDiscountsSequentially: true,
				})
			);

			// 10% of $16 = $1.60
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(1.6, 2);
			// 5% of $14.40 = $0.72
			expect(parseFloat(result.couponLines[1].discount!)).toBeCloseTo(0.72, 2);
			// Total = $16 - $1.60 - $0.72 = $13.68
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(13.68, 2);
		});
	});

	// -----------------------------------------------------------------------
	// Group 6: Duplicate product_id lines
	// -----------------------------------------------------------------------
	describe('duplicate product_id lines', () => {
		it('should apply percent coupon per-line without smearing across same product_id', () => {
			// Two lines with same product_id=1 but different POS prices
			const result = recalculateCoupons(
				makeInput({
					lineItems: [
						makePosLineItem(1, 100, 100), // line 0: $100
						makePosLineItem(1, 50, 50), // line 1: $50 (same product)
					],
					couponLines: [makeCouponLine('ten')],
					couponConfigs: new Map([['ten', makeConfig({ discount_type: 'percent', amount: '10' })]]),
				})
			);

			// 10% of $100 = $10, 10% of $50 = $5, total = $15
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(15, 2);
			// Line 0: $100 - $10 = $90
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(90, 2);
			// Line 1: $50 - $5 = $45
			expect(parseFloat(result.lineItems[1].total!)).toBeCloseTo(45, 2);
		});
	});

	// -----------------------------------------------------------------------
	// Group 7: Tax-inclusive percent coupons
	// -----------------------------------------------------------------------
	describe('tax-inclusive percent coupons', () => {
		it('should convert percent discount to ex-tax when pricesIncludeTax is true', () => {
			// Item $110 inclusive (= $100 ex-tax + $10 tax, 10% rate)
			// subtotal = $100 (ex-tax), subtotal_tax = $10
			const item = {
				product_id: 1,
				quantity: 1,
				subtotal: '100',
				subtotal_tax: '10',
				total: '100',
				total_tax: '10',
				taxes: [{ id: 1, subtotal: '10', total: '10' }],
				meta_data: [
					{
						key: '_woocommerce_pos_data',
						value: JSON.stringify({
							price: '110', // tax-inclusive POS price
							regular_price: '110',
							tax_status: 'taxable',
						}),
					},
				],
			} as unknown as LineItem;

			const result = recalculateCoupons(
				makeInput({
					lineItems: [item],
					couponLines: [makeCouponLine('ten')],
					couponConfigs: new Map([['ten', makeConfig({ discount_type: 'percent', amount: '10' })]]),
					pricesIncludeTax: true,
					taxRates: [{ id: 1, rate: '10', compound: false, order: 1, class: 'standard' }],
				})
			);

			// 10% of $110 inclusive = $11, ex-tax = $11 / 1.1 = $10
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(10, 2);
		});
	});

	// -----------------------------------------------------------------------
	// Group 8: Fixed product on POS price
	// -----------------------------------------------------------------------
	describe('fixed product on POS-discounted item', () => {
		it('should apply $5 fixed_product using POS price ($16) as base', () => {
			// Item regular=$18, POS price=$16, $5 fixed_product
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makePosLineItem(1, 16, 18)],
					couponLines: [makeCouponLine('five')],
					couponConfigs: new Map([
						['five', makeConfig({ discount_type: 'fixed_product', amount: '5' })],
					]),
				})
			);

			// $5 discount from $16 base
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(5, 2);
			// Total = $16 (POS price reset) - $5 = $11
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(11, 2);
		});
	});

	// -----------------------------------------------------------------------
	// Legacy subtotal fallback
	// -----------------------------------------------------------------------
	describe('legacy subtotal fallback', () => {
		it('should use pos_data.price for reset when subtotal holds regular_price * qty (legacy order)', () => {
			// Legacy order: subtotal was stored as regular_price * qty = 18
			// but POS price is 16
			const legacyItem = {
				product_id: 1,
				quantity: 1,
				subtotal: '18',
				subtotal_tax: '0',
				total: '18',
				total_tax: '0',
				taxes: [],
				meta_data: [
					{
						key: '_woocommerce_pos_data',
						value: JSON.stringify({
							price: '16',
							regular_price: '18',
							tax_status: 'taxable',
						}),
					},
				],
			} as unknown as LineItem;

			const result = recalculateCoupons(
				makeInput({
					lineItems: [legacyItem],
					couponLines: [makeCouponLine('ten')],
					couponConfigs: new Map([['ten', makeConfig({ discount_type: 'percent', amount: '10' })]]),
				})
			);

			// 10% of $16 POS price = $1.60 discount (not 10% of $18)
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(1.6, 2);
			// Total = $16 - $1.60 = $14.40
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(14.4, 2);
		});

		it('should reset legacy subtotal to pos_data.price * qty when no coupons present', () => {
			const legacyItem = {
				product_id: 1,
				quantity: 2,
				subtotal: '36',
				subtotal_tax: '0',
				total: '36',
				total_tax: '0',
				taxes: [],
				meta_data: [
					{
						key: '_woocommerce_pos_data',
						value: JSON.stringify({
							price: '16',
							regular_price: '18',
							tax_status: 'taxable',
						}),
					},
				],
			} as unknown as LineItem;

			const result = recalculateCoupons(
				makeInput({
					lineItems: [legacyItem],
					couponLines: [],
					couponConfigs: new Map(),
				})
			);

			// Should reset to 16 * 2 = 32, not stay at 36 (18 * 2)
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(32, 2);
			expect(parseFloat(result.lineItems[0].subtotal!)).toBeCloseTo(32, 2);
		});
	});

	// -----------------------------------------------------------------------
	// Misc product category matching
	// -----------------------------------------------------------------------
	describe('misc product category matching', () => {
		it('should apply category-restricted coupon to misc product with matching category', () => {
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makeMiscLineItem(20, 20, [{ id: 5, name: 'Clothing' }])],
					couponLines: [makeCouponLine('catcoupon')],
					couponConfigs: new Map([
						[
							'catcoupon',
							makeConfig({
								discount_type: 'percent',
								amount: '10',
								product_categories: [5],
							}),
						],
					]),
				})
			);

			// 10% of $20 = $2 discount
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(2, 2);
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(18, 2);
		});

		it('should NOT apply category-restricted coupon to misc product with non-matching category', () => {
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makeMiscLineItem(20, 20, [{ id: 99, name: 'Electronics' }])],
					couponLines: [makeCouponLine('catcoupon')],
					couponConfigs: new Map([
						[
							'catcoupon',
							makeConfig({
								discount_type: 'percent',
								amount: '10',
								product_categories: [5],
							}),
						],
					]),
				})
			);

			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(0, 2);
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(20, 2);
		});

		it('should NOT apply category-restricted coupon to misc product with no category', () => {
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makeMiscLineItem(20, 20)],
					couponLines: [makeCouponLine('catcoupon')],
					couponConfigs: new Map([
						[
							'catcoupon',
							makeConfig({
								discount_type: 'percent',
								amount: '10',
								product_categories: [5],
							}),
						],
					]),
				})
			);

			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(0, 2);
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(20, 2);
		});

		it('should exclude misc product when its category is in excluded_product_categories', () => {
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makeMiscLineItem(20, 20, [{ id: 5, name: 'Clothing' }])],
					couponLines: [makeCouponLine('excl')],
					couponConfigs: new Map([
						[
							'excl',
							makeConfig({
								discount_type: 'percent',
								amount: '10',
								excluded_product_categories: [5],
							}),
						],
					]),
				})
			);

			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(0, 2);
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(20, 2);
		});

		it('should apply category coupon only to the misc product with the matching category', () => {
			const result = recalculateCoupons(
				makeInput({
					lineItems: [
						makeMiscLineItem(20, 20, [{ id: 5, name: 'Clothing' }]),
						makeMiscLineItem(30, 30, [{ id: 10, name: 'Food' }]),
					],
					couponLines: [makeCouponLine('catcoupon')],
					couponConfigs: new Map([
						[
							'catcoupon',
							makeConfig({
								discount_type: 'percent',
								amount: '10',
								product_categories: [5],
							}),
						],
					]),
				})
			);

			// Only the first item ($20 with category 5) gets the discount
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(2, 2);
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(18, 2);
			// Second item ($30 with category 10) is unaffected
			expect(parseFloat(result.lineItems[1].total!)).toBeCloseTo(30, 2);
		});

		it('should apply unrestricted coupon to misc products regardless of category', () => {
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makeMiscLineItem(20, 20)],
					couponLines: [makeCouponLine('flat')],
					couponConfigs: new Map([
						[
							'flat',
							makeConfig({
								discount_type: 'percent',
								amount: '10',
							}),
						],
					]),
				})
			);

			// 10% of $20 = $2 discount (no category restriction)
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(2, 2);
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(18, 2);
		});
	});
});
