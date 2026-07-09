/**
 * @jest-environment node
 *
 * Integration tests that exercise the full coupon flow through `settleCart` —
 * one pure pass over a CartSnapshot + CouponContext producing one atomic patch.
 *
 * Each test case uses real order data from the POS and compares the result
 * against the WooCommerce server response. The pinned values predate the
 * settleCart extraction (they were produced by the legacy multi-step pipeline
 * in use-add-coupon.ts) — every pin must survive unchanged.
 *
 * Line items carry `_woocommerce_pos_data` with the POS unit price, exactly as
 * the app stores them: the replay resets totals from the POS price before
 * applying coupons (recalculateCoupons semantics).
 */
import { createCartConfig } from './config';
import { settleCart } from './settle';

import type { CartSnapshot } from './snapshot';
import type { CouponContext, LineItemInput, TaxRateInput } from './types';

// 10% compound tax rate (matches wcpos.local tax_id=4)
const taxRates10: TaxRateInput[] = [
	{ id: 4, rate: '10', compound: true, order: 1, class: 'standard' },
];

// 20% VAT (non-compound, matches PHP test setup)
const taxRates20: TaxRateInput[] = [
	{ id: 1, rate: '20', compound: false, order: 1, class: 'standard' },
];

// 21% VAT (non-compound, matches PHP issue #506 test)
const taxRates21: TaxRateInput[] = [
	{ id: 1, rate: '21', compound: false, order: 1, class: 'standard' },
];

/** `_woocommerce_pos_data` meta carrying the POS unit price (the coupon base). */
function posData(
	price: number | string,
	regularPrice: number | string = price,
	taxStatus = 'taxable'
) {
	return [
		{
			key: '_woocommerce_pos_data',
			value: JSON.stringify({
				price: String(price),
				regular_price: String(regularPrice),
				tax_status: taxStatus,
			}),
		},
	];
}

/**
 * Run the settle pipeline for a one-coupon cart.
 *
 * Builds the CartSnapshot (line items + a coupon line for the applied coupon)
 * and the CouponContext (coupon config keyed by lowercase code; the fixtures
 * carry no category restrictions, so productCategories stays empty), then
 * calls settleCart.
 */
function settle(
	lineItems: LineItemInput[],
	couponConfig: {
		code?: string;
		discount_type: 'percent' | 'fixed_cart' | 'fixed_product';
		amount: string;
		exclude_sale_items?: boolean;
	},
	pricesIncludeTax: boolean,
	rates: TaxRateInput[] = taxRates10
) {
	const code = couponConfig.code ?? 'testcoupon';
	const snapshot: CartSnapshot = {
		line_items: lineItems,
		coupon_lines: [{ code, discount: '0', discount_tax: '0', meta_data: [] }],
	};
	const context: CouponContext = {
		coupons: new Map([
			[
				code,
				{
					code,
					discount_type: couponConfig.discount_type,
					amount: couponConfig.amount,
					exclude_sale_items: couponConfig.exclude_sale_items || false,
				},
			],
		]),
		productCategories: new Map(),
	};
	const config = createCartConfig({
		rates,
		allRates: rates,
		calcTaxes: true,
		pricesIncludeTax,
		taxRoundAtSubtotal: false,
		dp: 2,
		shippingTaxClass: '',
		calcDiscountsSequentially: false,
	});

	const result = settleCart(snapshot, config, { coupons: context });
	if (!result.ok) {
		throw new Error(`settleCart failed: ${JSON.stringify(result.error)}`);
	}

	return {
		discountedLineItems: result.patch.line_items!,
		discount: result.patch.coupon_lines![0].discount!,
		discount_tax: result.patch.coupon_lines![0].discount_tax!,
		totals: result.totals,
	};
}

describe('coupon integration: real order scenarios', () => {
	/**
	 * Order scenario: 3 items, fixed_cart $10 coupon, prices include 10% tax
	 *
	 * Line items (pre-coupon, prices include tax):
	 *   Long Sleeve Tee:      $25 inc tax → ex-tax 22.727273, tax 2.272727
	 *   Hoodie with Logo:     $45 inc tax → ex-tax 40.909091, tax 4.090909
	 *   Hoodie with Pocket:   $35 inc tax (sale, regular $45) → ex-tax 31.818182, tax 3.181818
	 *                         subtotal uses regular price: 40.909091
	 *
	 * Cart total inc tax: $25 + $45 + $35 = $105
	 * After $10 coupon: should be $95
	 */
	it('fixed_cart $10 coupon with tax-inclusive pricing and sale item', () => {
		// Pre-coupon line items (after calculateLineItemTaxesAndTotals reset)
		const lineItems: LineItemInput[] = [
			{
				product_id: 71,
				quantity: 1,
				total: '22.727273',
				total_tax: '2.272727',
				subtotal: '22.727273',
				subtotal_tax: '2.272727',
				tax_class: '',
				taxes: [{ id: 4, subtotal: '2.272727', total: '2.272727' }],
				meta_data: posData(25),
			},
			{
				product_id: 63,
				quantity: 1,
				total: '40.909091',
				total_tax: '4.090909',
				subtotal: '40.909091',
				subtotal_tax: '4.090909',
				tax_class: '',
				taxes: [{ id: 4, subtotal: '4.090909', total: '4.090909' }],
				meta_data: posData(45),
			},
			{
				product_id: 69,
				quantity: 1,
				// total is sale price, subtotal is regular price
				total: '31.818182',
				total_tax: '3.181818',
				subtotal: '40.909091',
				subtotal_tax: '4.090909',
				tax_class: '',
				taxes: [{ id: 4, subtotal: '4.090909', total: '3.181818' }],
				meta_data: posData(35, 45),
			},
		];

		const { discountedLineItems, discount, discount_tax } = settle(
			lineItems,
			{ discount_type: 'fixed_cart', amount: '10' },
			true
		);

		// Each line item total + tax should be reduced
		const grandTotal = discountedLineItems.reduce((sum, item) => {
			return sum + parseFloat(item.total!) + parseFloat(item.total_tax!);
		}, 0);

		// The coupon distributes $10 total across items (tax-inclusive allocation)
		expect(105 - grandTotal).toBeCloseTo(10, 4);

		// Coupon line: discount + discount_tax ≈ $10 (tax-inclusive).
		// Per-item tax rounding (matching WC's wc_round_tax_total) produces a
		// ~0.009 gap here — WC itself has the same rounding artefact.
		const couponTotal = parseFloat(discount) + parseFloat(discount_tax);
		expect(couponTotal).toBeCloseTo(10, 1);

		// Cart was $105 inc tax, minus $10 coupon = $95
		expect(grandTotal).toBeCloseTo(95, 1);

		// Individual line items should all have reduced totals
		for (const item of discountedLineItems) {
			expect(parseFloat(item.total!)).toBeLessThan(parseFloat(item.subtotal!));
		}
	});

	/**
	 * Order from previous session: single item, fixed_product $3 coupon
	 *
	 * Logo Collection: $18 inc 10% tax → ex-tax 16.363636, tax 1.636364
	 * Coupon: fixed_product $3
	 * Expected: $18 - $3 = $15 inc tax
	 */
	it('fixed_product $3 coupon on single item with tax-inclusive pricing', () => {
		const lineItems: LineItemInput[] = [
			{
				product_id: 60,
				quantity: 1,
				total: '16.363636',
				total_tax: '1.636364',
				subtotal: '16.363636',
				subtotal_tax: '1.636364',
				tax_class: '',
				taxes: [{ id: 4, subtotal: '1.636364', total: '1.636364' }],
				meta_data: posData(18),
			},
		];

		const { discountedLineItems, discount, discount_tax } = settle(
			lineItems,
			{ discount_type: 'fixed_product', amount: '3' },
			true
		);

		const itemTotal =
			parseFloat(discountedLineItems[0].total!) + parseFloat(discountedLineItems[0].total_tax!);

		// $18 - $3 = $15
		expect(itemTotal).toBeCloseTo(15, 2);

		// Coupon line totals
		expect(parseFloat(discount) + parseFloat(discount_tax)).toBeCloseTo(3, 2);
	});

	/**
	 * Sanity check: prices EXCLUDE tax should pass through discount directly.
	 *
	 * Item: $50 ex-tax, 10% tax = $5 tax
	 * Coupon: fixed_cart $10
	 * Expected: total = $40 ex-tax, tax = $4
	 */
	it('fixed_cart $10 coupon with tax-exclusive pricing', () => {
		const lineItems: LineItemInput[] = [
			{
				product_id: 1,
				quantity: 1,
				total: '50',
				total_tax: '5',
				subtotal: '50',
				subtotal_tax: '5',
				tax_class: '',
				taxes: [{ id: 4, subtotal: '5', total: '5' }],
				meta_data: posData(50),
			},
		];

		const { discountedLineItems } = settle(
			lineItems,
			{ discount_type: 'fixed_cart', amount: '10' },
			false
		);

		// $50 - $10 = $40 ex-tax
		expect(parseFloat(discountedLineItems[0].total!)).toBeCloseTo(40, 4);
		// Tax scales proportionally: $5 * (40/50) = $4
		expect(parseFloat(discountedLineItems[0].total_tax!)).toBeCloseTo(4, 4);
	});

	/**
	 * Percent coupon with tax-inclusive pricing.
	 *
	 * Item: $22 inc 10% tax → ex-tax $20, tax $2
	 * Coupon: 50% off
	 * Expected: $11 inc tax → ex-tax $10, tax $1
	 */
	it('50% percent coupon with tax-inclusive pricing', () => {
		const lineItems: LineItemInput[] = [
			{
				product_id: 1,
				quantity: 1,
				total: '20',
				total_tax: '2',
				subtotal: '20',
				subtotal_tax: '2',
				tax_class: '',
				taxes: [{ id: 4, subtotal: '2', total: '2' }],
				meta_data: posData(22),
			},
		];

		const { discountedLineItems, discount, discount_tax } = settle(
			lineItems,
			{ discount_type: 'percent', amount: '50' },
			true
		);

		// 50% of 20 ex-tax = 10 discount. Percent discounts are already ex-tax (no conversion needed).
		const newTotal = parseFloat(discountedLineItems[0].total!);
		const newTax = parseFloat(discountedLineItems[0].total_tax!);

		// $22 * 50% = $11 inc tax
		expect(newTotal + newTax).toBeCloseTo(11, 2);

		// Coupon line: discount = $10 (ex-tax), discount_tax = $1
		expect(parseFloat(discount)).toBeCloseTo(10, 2);
		expect(parseFloat(discount_tax)).toBeCloseTo(1, 2);
	});
});

/**
 * PHP test parity: Test_Orders_Coupon_Discount.php
 *
 * These tests mirror the PHP test cases from woocommerce-pos to verify that
 * the JS coupon calculations produce the same results as WooCommerce's PHP
 * coupon engine with the WCPOS subtotal filter active.
 */
describe('coupon integration: PHP test parity (Test_Orders_Coupon_Discount)', () => {
	/**
	 * Matches: test_pos_discount_preserved_when_coupon_applied
	 *
	 * Product: regular $18, POS discounted to $16, no tax.
	 * 10% coupon should apply to $16 (POS price), not $18.
	 * Expected: total = $14.40
	 */
	it('percent coupon applies to POS sale price, not regular price (no tax)', () => {
		const lineItems: LineItemInput[] = [
			{
				product_id: 1,
				quantity: 1,
				total: '16',
				total_tax: '0',
				subtotal: '18',
				subtotal_tax: '0',
				tax_class: '',
				taxes: [],
				meta_data: posData(16, 18),
			},
		];

		const { discountedLineItems, discount } = settle(
			lineItems,
			{ discount_type: 'percent', amount: '10' },
			false,
			[]
		);

		// 10% of $16 = $1.60, total = $14.40
		expect(parseFloat(discount)).toBeCloseTo(1.6, 4);
		expect(parseFloat(discountedLineItems[0].total!)).toBeCloseTo(14.4, 2);
		// Subtotal unchanged at $18
		expect(parseFloat(discountedLineItems[0].subtotal!)).toBe(18);
	});

	/**
	 * Matches: test_mixed_items_coupon_calculates_correctly
	 *
	 * Item A: $18 regular, POS discounted to $16, no tax.
	 * Item B: $20, no discount, no tax.
	 * 10% coupon.
	 * Expected: Item A total = $14.40, Item B total = $18.00
	 */
	it('mixed items: coupon applies to POS price for discounted, regular for non-discounted', () => {
		const lineItems: LineItemInput[] = [
			{
				product_id: 1,
				quantity: 1,
				total: '16',
				total_tax: '0',
				subtotal: '18',
				subtotal_tax: '0',
				tax_class: '',
				taxes: [],
				meta_data: posData(16, 18),
			},
			{
				product_id: 2,
				quantity: 1,
				total: '20',
				total_tax: '0',
				subtotal: '20',
				subtotal_tax: '0',
				tax_class: '',
				taxes: [],
				meta_data: posData(20),
			},
		];

		const { discountedLineItems } = settle(
			lineItems,
			{ discount_type: 'percent', amount: '10' },
			false,
			[]
		);

		// Item A: 10% of $16 = $1.60, total = $14.40
		expect(parseFloat(discountedLineItems[0].total!)).toBeCloseTo(14.4, 2);
		// Item B: 10% of $20 = $2.00, total = $18.00
		expect(parseFloat(discountedLineItems[1].total!)).toBeCloseTo(18.0, 2);
	});

	/**
	 * Matches: test_coupon_with_tax_inclusive_and_pos_discount
	 *
	 * Product: €100 regular incl 20% VAT, POS price €80 incl.
	 * Ex-tax: regular = 83.33, POS = 66.67.
	 * 10% coupon.
	 * Expected: line total = €60.00, tax = €12.00, order total = €72.00
	 */
	it('percent coupon with tax-inclusive pricing and POS discount (20% VAT)', () => {
		// €80 incl 20% VAT → ex-tax = 66.666667, tax = 13.333333
		// €100 incl 20% VAT → ex-tax = 83.333333, tax = 16.666667
		const lineItems: LineItemInput[] = [
			{
				product_id: 1,
				quantity: 1,
				total: '66.666667',
				total_tax: '13.333333',
				subtotal: '83.333333',
				subtotal_tax: '16.666667',
				tax_class: '',
				taxes: [{ id: 1, subtotal: '16.666667', total: '13.333333' }],
				meta_data: posData(80, 100),
			},
		];

		const { discountedLineItems, discount, discount_tax } = settle(
			lineItems,
			{ discount_type: 'percent', amount: '10' },
			true,
			taxRates20
		);

		// 10% off €80 incl = €8. Ex-tax discount = €6.67. Line total = €66.67 - €6.67 = €60.00
		expect(parseFloat(discountedLineItems[0].total!)).toBeCloseTo(60.0, 2);
		expect(parseFloat(discountedLineItems[0].total_tax!)).toBeCloseTo(12.0, 2);

		// Order total = €60 + €12 = €72
		const orderTotal =
			parseFloat(discountedLineItems[0].total!) + parseFloat(discountedLineItems[0].total_tax!);
		expect(orderTotal).toBeCloseTo(72.0, 2);

		// Coupon line: discount = €6.67 ex-tax, discount_tax = €1.33
		expect(parseFloat(discount)).toBeCloseTo(6.67, 2);
		expect(parseFloat(discount_tax)).toBeCloseTo(1.33, 2);
	});

	/**
	 * Matches: test_coupon_with_tax_inclusive_no_pos_discount
	 *
	 * Product: €100 incl 20% VAT, no sale.
	 * 10% coupon.
	 * Expected: line total = €75.00, tax = €15.00, order total = €90.00
	 */
	it('percent coupon with tax-inclusive pricing, no POS discount (20% VAT)', () => {
		// €100 incl 20% VAT → ex-tax = 83.333333
		const lineItems: LineItemInput[] = [
			{
				product_id: 1,
				quantity: 1,
				total: '83.333333',
				total_tax: '16.666667',
				subtotal: '83.333333',
				subtotal_tax: '16.666667',
				tax_class: '',
				taxes: [{ id: 1, subtotal: '16.666667', total: '16.666667' }],
				meta_data: posData(100),
			},
		];

		const { discountedLineItems } = settle(
			lineItems,
			{ discount_type: 'percent', amount: '10' },
			true,
			taxRates20
		);

		expect(parseFloat(discountedLineItems[0].total!)).toBeCloseTo(75.0, 2);
		expect(parseFloat(discountedLineItems[0].total_tax!)).toBeCloseTo(15.0, 2);

		const orderTotal =
			parseFloat(discountedLineItems[0].total!) + parseFloat(discountedLineItems[0].total_tax!);
		expect(orderTotal).toBeCloseTo(90.0, 2);
	});

	/**
	 * Matches: test_coupon_with_tax_inclusive_but_exempt_item
	 *
	 * Product: €100 regular, POS price €80, tax_status = 'none'.
	 * 10% coupon.
	 * Expected: total = €72.00, tax = €0
	 */
	it('percent coupon with tax-inclusive pricing but tax-exempt item', () => {
		// Tax-exempt: €80 is the full price (no tax to extract)
		const lineItems: LineItemInput[] = [
			{
				product_id: 1,
				quantity: 1,
				total: '80',
				total_tax: '0',
				subtotal: '100',
				subtotal_tax: '0',
				tax_class: '',
				taxes: [],
				meta_data: posData(80, 100, 'none'),
			},
		];

		const { discountedLineItems } = settle(
			lineItems,
			{ discount_type: 'percent', amount: '10' },
			true,
			[]
		);

		// 10% of $80 = $8, total = $72
		expect(parseFloat(discountedLineItems[0].total!)).toBeCloseTo(72.0, 2);
		expect(parseFloat(discountedLineItems[0].total_tax!)).toBeCloseTo(0, 2);
	});

	/**
	 * Matches: test_coupon_with_tax_exclusive_and_pos_discount
	 *
	 * Product: €100 regular ex-tax, POS price €80 ex-tax, 20% VAT.
	 * 10% coupon.
	 * Expected: line total = €72.00, tax = €14.40, order total = €86.40
	 */
	it('percent coupon with tax-exclusive pricing and POS discount (20% VAT)', () => {
		// Prices exclude tax: €80 is already ex-tax
		const lineItems: LineItemInput[] = [
			{
				product_id: 1,
				quantity: 1,
				total: '80',
				total_tax: '16',
				subtotal: '100',
				subtotal_tax: '20',
				tax_class: '',
				taxes: [{ id: 1, subtotal: '20', total: '16' }],
				meta_data: posData(80, 100),
			},
		];

		const { discountedLineItems } = settle(
			lineItems,
			{ discount_type: 'percent', amount: '10' },
			false,
			taxRates20
		);

		// 10% of €80 = €8, total = €72 ex-tax
		expect(parseFloat(discountedLineItems[0].total!)).toBeCloseTo(72.0, 2);
		// Tax scales: €16 * (72/80) = €14.40
		expect(parseFloat(discountedLineItems[0].total_tax!)).toBeCloseTo(14.4, 2);

		const orderTotal =
			parseFloat(discountedLineItems[0].total!) + parseFloat(discountedLineItems[0].total_tax!);
		expect(orderTotal).toBeCloseTo(86.4, 2);
	});

	/**
	 * Matches: test_issue_506_coupon_with_tax_inclusive_pricing
	 *
	 * Product: €447 incl 21% VAT, no sale. Ex-tax = €369.42.
	 * 10% coupon.
	 * Expected: line total = €332.48, tax = €69.82, order total = €402.30
	 */
	it('issue #506: percent coupon with 21% VAT tax-inclusive pricing', () => {
		// €447 incl 21% VAT → ex-tax = 369.421488
		const exTax = 447 / 1.21;
		const tax = 447 - exTax;
		const lineItems: LineItemInput[] = [
			{
				product_id: 1,
				quantity: 1,
				total: String(exTax),
				total_tax: String(tax),
				subtotal: String(exTax),
				subtotal_tax: String(tax),
				tax_class: '',
				taxes: [{ id: 1, subtotal: String(tax), total: String(tax) }],
				meta_data: posData(447),
			},
		];

		const { discountedLineItems } = settle(
			lineItems,
			{ discount_type: 'percent', amount: '10' },
			true,
			taxRates21
		);

		expect(parseFloat(discountedLineItems[0].total!)).toBeCloseTo(332.48, 1);
		expect(parseFloat(discountedLineItems[0].total_tax!)).toBeCloseTo(69.82, 1);

		const orderTotal =
			parseFloat(discountedLineItems[0].total!) + parseFloat(discountedLineItems[0].total_tax!);
		expect(orderTotal).toBeCloseTo(402.3, 1);
	});
});
