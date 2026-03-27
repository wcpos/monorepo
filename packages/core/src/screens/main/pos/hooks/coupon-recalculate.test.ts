/** @jest-environment node */
/**
 * Tests for recalculateCoupons – the client-side mirror of WooCommerce's
 * recalculate_coupons() in abstract-wc-order.php.
 *
 * Key POS semantics:
 * - subtotal = regular_price * qty, total = price * qty
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
		subtotal: String(regularPrice * qty),
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
			// subtotal should remain $18 (unchanged)
			expect(parseFloat(result.lineItems[0].subtotal!)).toBeCloseTo(18, 2);
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

			// Item A: subtotal=$18, total = $16 (POS price) - $1.60 = $14.40
			expect(parseFloat(result.lineItems[0].subtotal!)).toBeCloseTo(18, 2);
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
});

// ---------------------------------------------------------------------------
// Layer 5: End-to-end parity regression tests
//
// Each test reproduces an exact permutation that caught a real parity bug
// during integration testing against WooCommerce servers. The expected values
// are taken from the WC server responses.
// ---------------------------------------------------------------------------

/** Create a taxed line item with pre-computed tax values */
const makeTaxedLineItem = (opts: {
	productId: number;
	price: number;
	regularPrice: number;
	qty?: number;
	subtotal: string;
	subtotalTax: string;
	total: string;
	totalTax: string;
	taxes: { id: number; subtotal: string; total: string }[];
	taxClass?: string;
}): LineItem =>
	({
		product_id: opts.productId,
		quantity: opts.qty ?? 1,
		tax_class: opts.taxClass ?? '',
		subtotal: opts.subtotal,
		subtotal_tax: opts.subtotalTax,
		total: opts.total,
		total_tax: opts.totalTax,
		taxes: opts.taxes,
		meta_data: [
			{
				key: '_woocommerce_pos_data',
				value: JSON.stringify({
					price: String(opts.price),
					regular_price: String(opts.regularPrice),
					tax_status: 'taxable',
				}),
			},
		],
	}) as unknown as LineItem;

describe('recalculateCoupons — parity regression (Layer 5)', () => {
	// US 10% tax rate (dev-free server, prices excl tax)
	const usTaxRate = {
		id: 6,
		rate: '10',
		compound: false,
		order: 1,
		class: 'standard',
	};

	describe('dev-free: Hoodie with Zipper + pct5 (discount_tax rounding)', () => {
		// Server: Hoodie with Zipper $45, 10% tax (excl), 5% coupon
		// This caught the roundHalfUp bug: 4.5 - 4.275 = 0.22499... in IEEE 754
		it('matches WC server output', () => {
			const lineItem = makeTaxedLineItem({
				productId: 71,
				price: 45,
				regularPrice: 45,
				subtotal: '45',
				subtotalTax: '4.5',
				total: '45',
				totalTax: '4.5',
				taxes: [{ id: 6, subtotal: '4.5', total: '4.5' }],
			});

			const result = recalculateCoupons(
				makeInput({
					lineItems: [lineItem],
					couponLines: [makeCouponLine('pct5')],
					couponConfigs: new Map([['pct5', makeConfig({ discount_type: 'percent', amount: '5' })]]),
					pricesIncludeTax: false,
					taxRates: [usTaxRate],
				})
			);

			// Coupon: 5% of $45 = $2.25
			expect(result.couponLines[0].discount).toBe('2.25');
			// discount_tax: tax on the $2.25 discount = 0.225 → round = 0.23
			expect(result.couponLines[0].discount_tax).toBe('0.23');
			// Line item total = $45 - $2.25 = $42.75
			expect(result.lineItems[0].total).toBe('42.75');
		});
	});

	describe('dev-free: stacked coupons (fixed_product + percent)', () => {
		// Tests that two stacked coupons both apply correctly.
		// Non-sequential: both coupons see the original POS price.
		it('applies both coupons and reduces total correctly', () => {
			const lineItem = makeTaxedLineItem({
				productId: 83,
				price: 18,
				regularPrice: 20,
				subtotal: '18',
				subtotalTax: '1.8',
				total: '18',
				totalTax: '1.8',
				taxes: [{ id: 6, subtotal: '1.8', total: '1.8' }],
			});

			const result = recalculateCoupons(
				makeInput({
					lineItems: [lineItem],
					couponLines: [makeCouponLine('fixed5'), makeCouponLine('pct10')],
					couponConfigs: new Map([
						['fixed5', makeConfig({ discount_type: 'fixed_product', amount: '5' })],
						['pct10', makeConfig({ discount_type: 'percent', amount: '10' })],
					]),
					pricesIncludeTax: false,
					taxRates: [usTaxRate],
				})
			);

			// fixed5: $5 off $18
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(5, 2);
			// pct10: non-sequential, 10% of original $18 = $1.80
			expect(parseFloat(result.couponLines[1].discount!)).toBeCloseTo(1.8, 2);
			// Total = $18 - $5 - $1.80 = $11.20
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(11.2, 2);

			// Both discount_tax values should be non-zero (10% tax)
			expect(parseFloat(result.couponLines[0].discount_tax!)).toBeGreaterThan(0);
			expect(parseFloat(result.couponLines[1].discount_tax!)).toBeGreaterThan(0);
		});

		it('sequential mode: second coupon sees reduced price', () => {
			const lineItem = makeTaxedLineItem({
				productId: 83,
				price: 18,
				regularPrice: 20,
				subtotal: '18',
				subtotalTax: '1.8',
				total: '18',
				totalTax: '1.8',
				taxes: [{ id: 6, subtotal: '1.8', total: '1.8' }],
			});

			const result = recalculateCoupons(
				makeInput({
					lineItems: [lineItem],
					couponLines: [makeCouponLine('fixed5'), makeCouponLine('pct10')],
					couponConfigs: new Map([
						['fixed5', makeConfig({ discount_type: 'fixed_product', amount: '5' })],
						['pct10', makeConfig({ discount_type: 'percent', amount: '10' })],
					]),
					pricesIncludeTax: false,
					calcDiscountsSequentially: true,
					taxRates: [usTaxRate],
				})
			);

			// fixed5: $5 off $18
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(5, 2);
			// pct10: sequential, 10% of ($18 - $5) = 10% of $13 = $1.30
			expect(parseFloat(result.couponLines[1].discount!)).toBeCloseTo(1.3, 2);
			// Total = $18 - $5 - $1.30 = $11.70
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(11.7, 2);
		});
	});

	describe('dev-pro: Beanie + Single + cart10music (fixed_cart mixed tax classes)', () => {
		// Server: dev-pro store 578 (GBP, prices incl tax, compound rates)
		// Beanie with Logo £18 (std tax), Single £2 (zero-rate)
		// cart10music: $10 fixed_cart restricted to music category
		// This caught the fixed_cart category bypass bug AND cart10music distribution
		const gbTaxRates = [
			{ id: 13, rate: '10', compound: false, order: 1, class: 'standard' },
			{ id: 14, rate: '2', compound: true, order: 2, class: 'standard' },
		];
		const zeroRate = { id: 15, rate: '0', compound: false, order: 1, class: 'zero-rate' };

		it('distributes fixed_cart across ALL items regardless of category', () => {
			const beanie = makeTaxedLineItem({
				productId: 83,
				price: 18,
				regularPrice: 20,
				subtotal: '16.042781',
				subtotalTax: '1.957219',
				total: '16.042781',
				totalTax: '1.957219',
				taxes: [
					{ id: 14, subtotal: '0.352941', total: '0.352941' },
					{ id: 13, subtotal: '1.604278', total: '1.604278' },
				],
			});

			const single = makeTaxedLineItem({
				productId: 75,
				price: 2,
				regularPrice: 3,
				subtotal: '2',
				subtotalTax: '0',
				total: '2',
				totalTax: '0',
				taxes: [],
				taxClass: 'zero-rate',
			});

			const musicCategoryId = 42;
			const clothingCategoryId = 15;

			const result = recalculateCoupons(
				makeInput({
					lineItems: [beanie, single],
					couponLines: [makeCouponLine('cart10music')],
					couponConfigs: new Map([
						[
							'cart10music',
							makeConfig({
								discount_type: 'fixed_cart',
								amount: '10',
								product_categories: [musicCategoryId],
							}),
						],
					]),
					pricesIncludeTax: true,
					taxRates: [...gbTaxRates, zeroRate],
					// Single is in music (validates coupon), Beanie is in clothing
					productCategories: new Map([
						[83, [{ id: clothingCategoryId }]],
						[75, [{ id: musicCategoryId }]],
					]),
				})
			);

			// fixed_cart should distribute across BOTH items (WC: is_valid_for_cart() bypass)
			// Total coupon discount should be close to £10 (tax-inclusive)
			const totalDiscount =
				parseFloat(result.couponLines[0].discount!) +
				parseFloat(result.couponLines[0].discount_tax!);
			// Precision 3 = ±$0.0005, catches any $0.01 regression while tolerating
			// float noise from incl-tax → ex-tax conversion
			expect(totalDiscount).toBeCloseTo(10, 3);

			// Both items should have reduced totals
			expect(parseFloat(result.lineItems[0].total!)).toBeLessThan(16.05);
			expect(result.lineItems[1].total).toBe('0');
		});
	});

	describe('dev-free: Two items + cart3 (per-item tax aggregation)', () => {
		// Beanie $18 + T-Shirt $18, $3 cart coupon, 10% tax (excl)
		// This caught the per-item tax rounding bug (3.26 vs 3.27)
		it('produces per-rate taxes that round correctly when aggregated', () => {
			const beanie = makeTaxedLineItem({
				productId: 83,
				price: 18,
				regularPrice: 20,
				subtotal: '18',
				subtotalTax: '1.8',
				total: '18',
				totalTax: '1.8',
				taxes: [{ id: 6, subtotal: '1.8', total: '1.8' }],
			});

			const tshirt = makeTaxedLineItem({
				productId: 82,
				price: 18,
				regularPrice: 18,
				subtotal: '18',
				subtotalTax: '1.8',
				total: '18',
				totalTax: '1.8',
				taxes: [{ id: 6, subtotal: '1.8', total: '1.8' }],
			});

			const result = recalculateCoupons(
				makeInput({
					lineItems: [beanie, tshirt],
					couponLines: [makeCouponLine('cart3')],
					couponConfigs: new Map([
						['cart3', makeConfig({ discount_type: 'fixed_cart', amount: '3' })],
					]),
					pricesIncludeTax: false,
					taxRates: [usTaxRate],
				})
			);

			// $3 distributed across two $18 items → $1.50 each (or $1.49 + $1.51 with penny dist)
			const total1 = parseFloat(result.lineItems[0].total!);
			const total2 = parseFloat(result.lineItems[1].total!);
			expect(total1 + total2).toBeCloseTo(33, 6); // $36 - $3 = $33

			// Coupon discount should be exactly $3
			expect(result.couponLines[0].discount).toBe('3');
		});
	});

	describe('dev-pro: fixed2clothacc with category ancestry', () => {
		// Beanie (Accessories) + T-Shirt (Tshirts→child of Clothing)
		// Coupon restricted to [Clothing, Accessories]
		// Without ancestry: T-Shirt excluded. With ancestry: both included.
		it('applies fixed_product to items in child categories when ancestors are enriched', () => {
			const clothingId = 16;
			const tshirtsId = 17;
			const accessoriesId = 19;

			const beanie = makeTaxedLineItem({
				productId: 83,
				price: 18,
				regularPrice: 20,
				subtotal: '18',
				subtotalTax: '0',
				total: '18',
				totalTax: '0',
				taxes: [],
			});

			const tshirt = makeTaxedLineItem({
				productId: 82,
				price: 18,
				regularPrice: 18,
				subtotal: '18',
				subtotalTax: '0',
				total: '18',
				totalTax: '0',
				taxes: [],
			});

			const result = recalculateCoupons(
				makeInput({
					lineItems: [beanie, tshirt],
					couponLines: [makeCouponLine('fixed2clothacc')],
					couponConfigs: new Map([
						[
							'fixed2clothacc',
							makeConfig({
								discount_type: 'fixed_product',
								amount: '2',
								product_categories: [clothingId, accessoriesId],
							}),
						],
					]),
					pricesIncludeTax: false,
					taxRates: [],
					// Enriched: T-shirt has both Tshirts AND Clothing (ancestor)
					productCategories: new Map([
						[83, [{ id: accessoriesId }]],
						[82, [{ id: tshirtsId }, { id: clothingId }]], // ancestry enriched
					]),
				})
			);

			// Both items should get $2 discount each
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(16, 0);
			expect(parseFloat(result.lineItems[1].total!)).toBeCloseTo(16, 0);
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(4, 0);
		});

		it('only discounts directly-matching item WITHOUT ancestry enrichment', () => {
			const clothingId = 16;
			const tshirtsId = 17;
			const accessoriesId = 19;

			const beanie = makeTaxedLineItem({
				productId: 83,
				price: 18,
				regularPrice: 20,
				subtotal: '18',
				subtotalTax: '0',
				total: '18',
				totalTax: '0',
				taxes: [],
			});

			const tshirt = makeTaxedLineItem({
				productId: 82,
				price: 18,
				regularPrice: 18,
				subtotal: '18',
				subtotalTax: '0',
				total: '18',
				totalTax: '0',
				taxes: [],
			});

			const result = recalculateCoupons(
				makeInput({
					lineItems: [beanie, tshirt],
					couponLines: [makeCouponLine('fixed2clothacc')],
					couponConfigs: new Map([
						[
							'fixed2clothacc',
							makeConfig({
								discount_type: 'fixed_product',
								amount: '2',
								product_categories: [clothingId, accessoriesId],
							}),
						],
					]),
					pricesIncludeTax: false,
					taxRates: [],
					// NOT enriched: T-shirt only has Tshirts (no Clothing ancestor)
					productCategories: new Map([
						[83, [{ id: accessoriesId }]],
						[82, [{ id: tshirtsId }]], // missing Clothing ancestor
					]),
				})
			);

			// Only beanie (Accessories) gets $2 discount, T-shirt excluded
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(16, 0);
			expect(parseFloat(result.lineItems[1].total!)).toBeCloseTo(18, 0);
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(2, 0);
		});
	});

	// -----------------------------------------------------------------------
	// Deleted items — order 57051 from dev-pro.wcpos.com
	// -----------------------------------------------------------------------
	describe('deleted items in input arrays', () => {
		it('should exclude deleted line items (product_id: null) from coupon calculations', () => {
			const activeItem = makePosLineItem(67, 55, 65);
			const deletedItem = {
				...makePosLineItem(99, 35, 45),
				product_id: null,
				id: 221488,
			} as unknown as LineItem;

			const result = recalculateCoupons(
				makeInput({
					lineItems: [activeItem, deletedItem],
					couponLines: [makeCouponLine('save10')],
					couponConfigs: new Map([
						['save10', makeConfig({ discount_type: 'percent', amount: '10' })],
					]),
				})
			);

			// 10% of $55 = $5.50 discount on Belt only
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(5.5, 1);
			// Deleted item should still be in the array (preserved for server sync)
			expect(result.lineItems[1].product_id).toBeNull();
		});

		it('should preserve deleted coupon lines (code: null) without recalculating them', () => {
			const item = makePosLineItem(67, 55, 65);
			const activeCoupon = makeCouponLine('save10');
			const deletedCoupon = {
				...makeCouponLine('old'),
				code: null,
				id: 221486,
				discount: '5.00',
				discount_tax: '1.00',
			} as unknown as CouponLine;

			const result = recalculateCoupons(
				makeInput({
					lineItems: [item],
					couponLines: [deletedCoupon, activeCoupon],
					couponConfigs: new Map([
						['save10', makeConfig({ discount_type: 'percent', amount: '10' })],
					]),
				})
			);

			// Active coupon should calculate correctly
			expect(parseFloat(result.couponLines[1].discount!)).toBeCloseTo(5.5, 1);
			// Deleted coupon should be preserved as-is (code still null)
			expect(result.couponLines[0].code).toBeNull();
			expect(result.couponLines[0].discount).toBe('5.00');
		});

		it('should handle mixed active and deleted items (order 57051 scenario)', () => {
			const producto = makePosLineItem(0, 2, 2);
			const hoodie = {
				...makePosLineItem(99, 35, 45),
				product_id: null,
				id: 221488,
			} as unknown as LineItem;
			const belt = makePosLineItem(67, 55, 65);

			const deletedPennyCoupon = {
				code: null,
				id: 221486,
				discount: '0.00817',
				discount_tax: '0.00183',
				meta_data: [],
			} as unknown as CouponLine;

			const result = recalculateCoupons(
				makeInput({
					lineItems: [producto, hoodie, belt],
					couponLines: [deletedPennyCoupon, makeCouponLine('penny'), makeCouponLine('band25to75')],
					couponConfigs: new Map([
						['penny', makeConfig({ discount_type: 'fixed_cart', amount: '0.01' })],
						['band25to75', makeConfig({ discount_type: 'percent', amount: '10' })],
					]),
				})
			);

			// Discount should only apply to active items: Producto ($2) + Belt ($55)
			const totalDiscount = result.couponLines
				.filter((cl) => cl.code != null)
				.reduce((sum, cl) => sum + parseFloat(cl.discount || '0'), 0);

			// ~$5.71 on $57, NOT ~$9.21 on $92
			expect(totalDiscount).toBeLessThan(6);
			expect(totalDiscount).toBeGreaterThan(5);
		});
	});
});
