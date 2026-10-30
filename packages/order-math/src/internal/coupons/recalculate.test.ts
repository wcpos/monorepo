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
import { recalculateCoupons } from './recalculate';

import type { RecalculateInput, RecalculateResult } from './recalculate';
import type { CouponDiscountConfig } from './discount';

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
	describe('order-item tax rounding (US:AL compound, prices incl. tax)', () => {
		const taxRates = [
			{ id: 3, rate: '4.0000', priority: 1, compound: false, order: 0, class: 'standard' },
			{ id: 5, rate: '1.0000', priority: 2, compound: true, order: 0, class: 'standard' },
			{ id: 4, rate: '5.0000', priority: 3, compound: true, order: 0, class: 'standard' },
		];

		function replay(discountType: 'percent' | 'fixed_cart', taxRoundAtSubtotal: boolean) {
			return recalculateCoupons(
				makeInput({
					lineItems: [
						{ ...makePosLineItem(1, 25, 25), tax_class: '', subtotal: '22.667102' },
						makePosLineItem(2, 5, 5, 1, 'none'),
					],
					couponLines: [makeCouponLine('rounding')],
					couponConfigs: new Map([
						[
							'rounding',
							makeConfig({
								discount_type: discountType,
								amount: discountType === 'percent' ? '10' : '1',
							}),
						],
					]),
					taxRates,
					pricesIncludeTax: true,
					calcDiscountsSequentially: false,
					taxRoundAtSubtotal,
					dp: 2,
				})
			);
		}

		it('A: percent 10 rounds each stored rate before summing when round-at-subtotal is off', () => {
			const line = replay('percent', false).lineItems[0];
			expect(Number(line.total)).toBe(20.400392);
			expect(Number(line.total_tax)).toBe(2.1);
			expect(Number(line.taxes?.find((tax) => tax.id === 3)?.total)).toBe(0.816016);
			expect(Number(line.taxes?.find((tax) => tax.id === 5)?.total)).toBe(0.212164);
			expect(Number(line.taxes?.find((tax) => tax.id === 4)?.total)).toBe(1.071429);
		});

		it('B: percent 10 sums stored rates when round-at-subtotal is on', () => {
			const line = replay('percent', true).lineItems[0];
			expect(Number(line.total)).toBe(20.400392);
			expect(Number(line.total_tax)).toBe(2.099609);
		});

		it('C: fixed_cart 1 decomposes the discount at 6dp when round-at-subtotal is off', () => {
			const { lineItems } = replay('fixed_cart', false);
			const line = lineItems[0];
			expect(Number(line.total)).toBe(22.213761);
			expect(Number(line.total_tax)).toBe(2.29);
			expect(Number(line.taxes?.find((tax) => tax.id === 3)?.total)).toBe(0.88855);
			expect(Number(line.taxes?.find((tax) => tax.id === 5)?.total)).toBe(0.231023);
			expect(Number(line.taxes?.find((tax) => tax.id === 4)?.total)).toBe(1.166667);
			expect(Number(lineItems[1].total)).toBe(4.5);
		});

		it('D: fixed_cart 1 sums stored rates when round-at-subtotal is on', () => {
			const line = replay('fixed_cart', true).lineItems[0];
			expect(Number(line.total)).toBe(22.213761);
			expect(Number(line.total_tax)).toBe(2.28624);
		});
	});

	describe('#2356 order-item tax parity: fixed_product and exclusive prices', () => {
		const taxRates = [
			{ id: 3, rate: '4.0000', priority: 1, compound: false, order: 0, class: 'standard' },
			{ id: 5, rate: '1.0000', priority: 2, compound: true, order: 0, class: 'standard' },
			{ id: 4, rate: '5.0000', priority: 3, compound: true, order: 0, class: 'standard' },
		];

		function replay(
			discountType: 'percent' | 'fixed_cart' | 'fixed_product',
			pricesIncludeTax: boolean,
			taxRoundAtSubtotal: boolean,
			rates = taxRates
		) {
			return recalculateCoupons(
				makeInput({
					lineItems: [
						{
							...makePosLineItem(1, 25, 25),
							tax_class: '',
							subtotal: pricesIncludeTax ? '22.667102' : '25',
						},
						makePosLineItem(2, 5, 5, 1, 'none'),
					],
					couponLines: [makeCouponLine('parity')],
					couponConfigs: new Map([
						[
							'parity',
							makeConfig({
								discount_type: discountType,
								amount:
									discountType === 'percent' ? '10' : discountType === 'fixed_cart' ? '1' : '1.37',
							}),
						],
					]),
					taxRates: rates,
					pricesIncludeTax,
					calcDiscountsSequentially: false,
					taxRoundAtSubtotal,
					dp: 2,
				})
			);
		}

		// WC_Discounts::apply_coupon_fixed_product: wc_add_number_precision(1.37) = 137
		// cents per qty-1 item, neither capped; discounts 1.37 + 1.37 = 2.74.
		// WC_Abstract_Order::set_item_discount_amounts -> WC_Tax::calc_tax(..., true)
		// -> calc_inclusive_tax: id 4 = 1.37 - 1.37/1.05 = 0.065238095...;
		// id 5 = 1.37/1.05 - 1.37/1.05/1.01 = 0.012918434...;
		// id 3 = (1.37/1.05/1.01)*0.04/1.04 = 0.049686287....
		// WC_Tax::round (6dp HALF_UP): 0.065238 + 0.012918 + 0.049686 = 0.127842.
		// Net discount = 1.37 - 0.127842 = 1.242158; set_total/wc_format_decimal
		// stores 22.667102 - 1.242158 = 21.424944; non-taxable total = 5 - 1.37 = 3.63.
		// WC_Order_Item::calculate_taxes -> WC_Tax::calc_exclusive_tax(21.424944):
		// id 3 = net*0.04 = 0.85699776; id 5 = net*1.04*0.01 = 0.2228194176;
		// id 4 = net*1.04*1.01*0.05 = 1.12523805888. WC_Tax::round stores
		// 0.856998, 0.222819, 1.125238; WC_Order_Item_Product::set_taxes (off)
		// sums wc_round_tax_total (2dp HALF_DOWN): 0.86 + 0.22 + 1.13 = 2.21.
		// WC_Abstract_Order::set_coupon_discount_amounts sums the inclusive discount
		// taxes above, then wc_round_tax_total(0.127842) = 0.13 (2dp HALF_DOWN);
		// coupon discount = 2.74 - 0.13 = 2.61; discount_tax = 0.13.
		it('E: inclusive fixed_product 1.37 with round-at-subtotal off', () => {
			const { lineItems, couponLines } = replay('fixed_product', true, false);
			const line = lineItems[0];
			expect(Number(line.total)).toBe(21.424944);
			expect(Number(line.taxes?.find((tax) => tax.id === 3)?.total)).toBe(0.856998);
			expect(Number(line.taxes?.find((tax) => tax.id === 5)?.total)).toBe(0.222819);
			expect(Number(line.taxes?.find((tax) => tax.id === 4)?.total)).toBe(1.125238);
			expect(Number(line.total_tax)).toBe(2.21);
			expect(Number(lineItems[1].total)).toBe(3.63);
			expect(Number(couponLines[0].discount_tax)).toBe(0.13);
			expect(Number(couponLines[0].discount)).toBe(2.61);
		});

		// WC_Discounts::apply_coupon_fixed_product: wc_add_number_precision(1.37) = 137
		// cents per qty-1 item, neither capped; discounts 1.37 + 1.37 = 2.74.
		// WC_Abstract_Order::set_item_discount_amounts -> WC_Tax::calc_inclusive_tax:
		// id 4 = 1.37 - 1.37/1.05 = 0.065238095...;
		// id 5 = 1.37/1.05 - 1.37/1.05/1.01 = 0.012918434...;
		// id 3 = (1.37/1.05/1.01)*0.04/1.04 = 0.049686287....
		// WC_Tax::round (6dp HALF_UP): 0.065238 + 0.012918 + 0.049686 = 0.127842.
		// Net discount = 1.242158; set_total/wc_format_decimal stores
		// 22.667102 - 1.242158 = 21.424944; non-taxable total = 5 - 1.37 = 3.63.
		// WC_Order_Item::calculate_taxes -> WC_Tax::calc_exclusive_tax(21.424944):
		// id 3 = net*0.04 = 0.85699776; id 5 = net*1.04*0.01 = 0.2228194176;
		// id 4 = net*1.04*1.01*0.05 = 1.12523805888. WC_Tax::round (6dp HALF_UP)
		// stores 0.856998, 0.222819, 1.125238; WC_Order_Item_Product::set_taxes (on)
		// sums them without cent rounding: total_tax = 2.205055.
		// WC_Abstract_Order::set_coupon_discount_amounts (on) keeps the inclusive
		// discount tax sum 0.127842; coupon discount = 2.74 - 0.127842 = 2.612158.
		it('F: inclusive fixed_product 1.37 with round-at-subtotal on', () => {
			const { lineItems, couponLines } = replay('fixed_product', true, true);
			const line = lineItems[0];
			expect(Number(line.total)).toBe(21.424944);
			expect(Number(line.taxes?.find((tax) => tax.id === 3)?.total)).toBe(0.856998);
			expect(Number(line.taxes?.find((tax) => tax.id === 5)?.total)).toBe(0.222819);
			expect(Number(line.taxes?.find((tax) => tax.id === 4)?.total)).toBe(1.125238);
			expect(Number(line.total_tax)).toBe(2.205055);
			expect(Number(lineItems[1].total)).toBe(3.63);
			expect(Number(couponLines[0].discount)).toBe(2.612158);
			expect(Number(couponLines[0].discount_tax)).toBe(0.127842);
		});

		// WC_Discounts::apply_coupon_percent: wc_add_number_precision gives 2500/500
		// cents; floor(2500*0.10) = 250 and floor(500*0.10) = 50, no remainder.
		// WC_Abstract_Order::set_item_discount_amounts (exclusive) subtracts directly:
		// 25 - 2.50 = 22.5; non-taxable 5 - 0.50 = 4.5 (no rounding needed).
		// WC_Order_Item::calculate_taxes -> WC_Tax::calc_exclusive_tax(22.5):
		// id 3 = 22.5*0.04 = 0.9; id 5 = 22.5*1.04*0.01 = 0.234;
		// id 4 = 22.5*1.04*1.01*0.05 = 1.1817; WC_Tax::round (6dp HALF_UP)
		// leaves all unchanged. WC_Order_Item_Product::set_taxes (off) sums
		// wc_round_tax_total (2dp HALF_UP): 0.90 + 0.23 + 1.18 = 2.31.
		// WC_Abstract_Order::set_coupon_discount_amounts -> calc_tax(2.5, rates, false):
		// 2.5*0.04 = 0.1; 2.5*1.04*0.01 = 0.026; 2.5*1.04*1.01*0.05 = 0.1313.
		// WC_Tax::round leaves each unchanged at 6dp; sum = 0.2573, then
		// wc_round_tax_total (2dp HALF_UP) = 0.26. Exclusive discount = 2.5 + 0.5 = 3.
		it('G: exclusive percent 10 with round-at-subtotal off', () => {
			const { lineItems, couponLines } = replay('percent', false, false);
			const line = lineItems[0];
			expect(Number(line.total)).toBe(22.5);
			expect(Number(line.taxes?.find((tax) => tax.id === 3)?.total)).toBe(0.9);
			expect(Number(line.taxes?.find((tax) => tax.id === 5)?.total)).toBe(0.234);
			expect(Number(line.taxes?.find((tax) => tax.id === 4)?.total)).toBe(1.1817);
			expect(Number(line.total_tax)).toBe(2.31);
			expect(Number(lineItems[1].total)).toBe(4.5);
			expect(Number(couponLines[0].discount)).toBe(3);
			expect(Number(couponLines[0].discount_tax)).toBe(0.26);
		});

		// WC_Discounts::apply_coupon_fixed_cart: wc_add_number_precision(1) = 100
		// cents / 2 units = 50 cents each (floor unchanged, no remainder), allocated
		// by apply_coupon_fixed_product. WC_Abstract_Order::set_item_discount_amounts
		// (exclusive): 25 - 0.5 = 24.5; non-taxable 5 - 0.5 = 4.5.
		// WC_Order_Item::calculate_taxes -> WC_Tax::calc_exclusive_tax(24.5):
		// id 3 = 24.5*0.04 = 0.98; id 5 = 24.5*1.04*0.01 = 0.2548;
		// id 4 = 24.5*1.04*1.01*0.05 = 1.28674; WC_Tax::round (6dp HALF_UP)
		// leaves each unchanged. WC_Order_Item_Product::set_taxes (off) sums
		// wc_round_tax_total (2dp HALF_UP): 0.98 + 0.25 + 1.29 = 2.52.
		// WC_Abstract_Order::set_coupon_discount_amounts -> calc_tax(0.5, rates, false):
		// 0.5*0.04 = 0.02; 0.5*1.04*0.01 = 0.0052; 0.5*1.04*1.01*0.05 = 0.02626.
		// WC_Tax::round leaves each unchanged at 6dp; sum = 0.05146, then
		// wc_round_tax_total (2dp HALF_UP) = 0.05. Exclusive discount = 0.5 + 0.5 = 1.
		it('H: exclusive fixed_cart 1 with round-at-subtotal off', () => {
			const { lineItems, couponLines } = replay('fixed_cart', false, false);
			const line = lineItems[0];
			expect(Number(line.total)).toBe(24.5);
			expect(Number(line.taxes?.find((tax) => tax.id === 3)?.total)).toBe(0.98);
			expect(Number(line.taxes?.find((tax) => tax.id === 5)?.total)).toBe(0.2548);
			expect(Number(line.taxes?.find((tax) => tax.id === 4)?.total)).toBe(1.28674);
			expect(Number(line.total_tax)).toBe(2.52);
			expect(Number(lineItems[1].total)).toBe(4.5);
			expect(Number(couponLines[0].discount)).toBe(1);
			expect(Number(couponLines[0].discount_tax)).toBe(0.05);
		});

		// WC_Discounts::apply_coupon_fixed_product: wc_add_number_precision(1.37) = 137
		// cents per qty-1 item, neither capped; discounts 1.37 + 1.37 = 2.74.
		// WC_Abstract_Order::set_item_discount_amounts (exclusive):
		// 25 - 1.37 = 23.63; non-taxable 5 - 1.37 = 3.63 (no rounding needed).
		// WC_Order_Item::calculate_taxes -> WC_Tax::calc_exclusive_tax(23.63):
		// id 3 = 23.63*0.04 = 0.9452; id 5 = 23.63*1.04*0.01 = 0.245752;
		// id 4 = 23.63*1.04*1.01*0.05 = 1.2410476. WC_Tax::round (6dp HALF_UP)
		// stores 0.9452, 0.245752, 1.241048; WC_Order_Item_Product::set_taxes (on)
		// sums without cent rounding: total_tax = 2.432.
		// WC_Abstract_Order::set_coupon_discount_amounts -> calc_tax(1.37, rates, false):
		// 1.37*0.04 = 0.0548; 1.37*1.04*0.01 = 0.014248;
		// 1.37*1.04*1.01*0.05 = 0.0719524 -> 0.071952 (WC_Tax::round, 6dp HALF_UP).
		// Sum = 0.141; on means no cent rounding. Exclusive coupon discount stays 2.74.
		it('I: exclusive fixed_product 1.37 with round-at-subtotal on', () => {
			const { lineItems, couponLines } = replay('fixed_product', false, true);
			const line = lineItems[0];
			expect(Number(line.total)).toBe(23.63);
			expect(Number(line.taxes?.find((tax) => tax.id === 3)?.total)).toBe(0.9452);
			expect(Number(line.taxes?.find((tax) => tax.id === 5)?.total)).toBe(0.245752);
			expect(Number(line.taxes?.find((tax) => tax.id === 4)?.total)).toBe(1.241048);
			expect(Number(line.total_tax)).toBe(2.432);
			expect(Number(lineItems[1].total)).toBe(3.63);
			expect(Number(couponLines[0].discount)).toBe(2.74);
			expect(Number(couponLines[0].discount_tax)).toBe(0.141);
		});

		// WC_Discounts::apply_coupon_percent: wc_add_number_precision gives 2500/500
		// cents; floor(2500*0.10) = 250 and floor(500*0.10) = 50, no remainder.
		// WC_Abstract_Order::set_item_discount_amounts (exclusive):
		// 25 - 2.5 = 22.5; non-taxable 5 - 0.5 = 4.5 (no rounding needed).
		// WC_Order_Item::calculate_taxes -> WC_Tax::calc_exclusive_tax(22.5):
		// id 9 = 22.5*0.20 = 4.5, unchanged by WC_Tax::round (6dp HALF_UP).
		// WC_Order_Item_Product::set_taxes (off): wc_round_tax_total(4.5) = 4.5
		// (2dp HALF_UP). WC_Abstract_Order::set_coupon_discount_amounts calls
		// calc_tax(2.5, rates, false): 2.5*0.20 = 0.5, unchanged at 6dp and by
		// wc_round_tax_total (2dp HALF_UP). Exclusive coupon discount = 2.5 + 0.5 = 3.
		it('J: exclusive percent 10 at a single 20% rate with round-at-subtotal off', () => {
			const { lineItems, couponLines } = replay('percent', false, false, [
				{ id: 9, rate: '20.0000', priority: 1, compound: false, order: 0, class: 'standard' },
			]);
			const line = lineItems[0];
			expect(Number(line.total)).toBe(22.5);
			expect(Number(line.taxes?.find((tax) => tax.id === 9)?.total)).toBe(4.5);
			expect(Number(line.total_tax)).toBe(4.5);
			expect(Number(lineItems[1].total)).toBe(4.5);
			expect(Number(couponLines[0].discount)).toBe(3);
			expect(Number(couponLines[0].discount_tax)).toBe(0.5);
		});
	});

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

		it('preserves configured-width half-up taxes during the coupon reset', () => {
			const result = recalculateCoupons(
				makeInput({
					lineItems: [makePosLineItem(1, 0.10003, 0.10003)],
					couponLines: [],
					couponConfigs: new Map(),
					dp: 5,
					taxRates: [
						{
							id: 1,
							rate: '5.0000',
							compound: false,
							order: 1,
							class: 'standard',
						},
					],
				})
			);

			expect(result.lineItems[0].taxes).toEqual([
				{ id: 1, subtotal: '0.0050015', total: '0.0050015' },
			]);
		});

		it('does not serialize a numeric prefix from a malformed tax value', () => {
			const lineItem = makePosLineItem(1, 1, 1);
			lineItem.taxes = [{ id: 1, subtotal: '0.01invalid', total: '0.01' }];

			const result = recalculateCoupons(
				makeInput({
					lineItems: [lineItem],
					couponLines: [],
					couponConfigs: new Map(),
					taxRates: [{ id: 1, rate: '1.0000', compound: false, order: 1, class: 'standard' }],
				})
			);

			expect(result.lineItems[0].taxes).toEqual([
				{ id: 1, subtotal: '0.01invalid', total: '0.010000' },
			]);
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
		it('should detect typed object POS data as on sale', () => {
			const item = makePosLineItem(1, 16, 18);
			item.meta_data = [
				{
					key: '_woocommerce_pos_data',
					value: { price: '16', regular_price: '18', tax_status: 'taxable' },
				},
			];

			const result = recalculateCoupons(
				makeInput({
					lineItems: [item],
					couponLines: [makeCouponLine('sale')],
					couponConfigs: new Map([
						[
							'sale',
							makeConfig({ discount_type: 'percent', amount: '10', exclude_sale_items: true }),
						],
					]),
				})
			);

			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(0, 2);
			expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(16, 2);
		});

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

	describe('non-taxable item + taxable item + percent coupon (tax_status none)', () => {
		// Real user scenario — demo.wcpos.com order #27274:
		// Poster $50 (taxable), biscuits $20 (tax_status: 'none'), both standard class.
		// Tax: US 10% + US AL 2% (compound). popular20 = 20% off the whole cart.
		// WooCommerce taxes ONLY the Poster; biscuits is exempt:
		//   Poster   : $40 + US $4.00 + US AL $0.88
		//   biscuits : $16 + $0 tax
		//   Order total = $60.88  (the POS bug produced $62.83 by taxing biscuits)
		const usRates = [
			{ id: 6, rate: '10', compound: false, order: 1, class: 'standard' },
			{ id: 7, rate: '2', compound: true, order: 2, class: 'standard' },
		];

		it('does not tax a tax_status=none item when a coupon is applied', () => {
			const poster = makePosLineItem(1, 50, 80, 1, 'taxable');
			const biscuits = makePosLineItem(16, 20, 25, 1, 'none');

			const result = recalculateCoupons(
				makeInput({
					lineItems: [poster, biscuits],
					couponLines: [makeCouponLine('popular20')],
					couponConfigs: new Map([
						['popular20', makeConfig({ discount_type: 'percent', amount: '20' })],
					]),
					pricesIncludeTax: false,
					taxRates: usRates,
				})
			);

			const posterOut = result.lineItems.find((li) => li.product_id === 1)!;
			const biscuitsOut = result.lineItems.find((li) => li.product_id === 16)!;

			// Poster: $50 − 20% = $40 ex-tax; US $4.00 + US AL compound $0.88 = $4.88
			expect(parseFloat(posterOut.total!)).toBeCloseTo(40, 2);
			expect(parseFloat(posterOut.total_tax!)).toBeCloseTo(4.88, 2);

			// biscuits: $20 − 20% = $16 ex-tax; NO tax because tax_status === 'none'
			expect(parseFloat(biscuitsOut.total!)).toBeCloseTo(16, 2);
			expect(parseFloat(biscuitsOut.total_tax!)).toBeCloseTo(0, 2);
			expect(biscuitsOut.taxes ?? []).toHaveLength(0);

			// Order total = Σ(line total + line tax) = 56 + 4.88 = $60.88 (matches WC)
			const orderTotal = result.lineItems.reduce(
				(sum, li) => sum + parseFloat(li.total!) + parseFloat(li.total_tax!),
				0
			);
			expect(orderTotal).toBeCloseTo(60.88, 2);

			// coupon_line discount = $14 (20% of $70); discount_tax reflects only the
			// taxable Poster portion: tax on its $10 discount = US $1.00 + US AL
			// compound ($10+$1)×2% = $0.22 → $1.22. The exempt biscuits $4 adds $0.
			expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(14, 2);
			expect(parseFloat(result.couponLines[0].discount_tax!)).toBeCloseTo(1.22, 2);
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
			expect(result.lineItems[0].total).toBe('16');
			expect(result.lineItems[1].total).toBe('16');
			expect(result.couponLines[0].discount).toBe('4');
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
			expect(result.lineItems[0].total).toBe('16');
			expect(result.lineItems[1].total).toBe('18');
			expect(result.couponLines[0].discount).toBe('2');
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
			expect(result.couponLines[0].discount).toBe('5.5');
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
			expect(result.couponLines[1].discount).toBe('5.5');
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

describe('VAT-exempt coupon replay', () => {
	it.each(['percent', 'fixed_cart', 'stacked', 'none'] as const)(
		'clears stored taxes for %s coupons, with or without POS metadata',
		(kind) => {
			const codes = kind === 'none' ? [] : kind === 'stacked' ? ['first', 'second'] : ['first'];
			for (const hasPosData of [true, false]) {
				const item = {
					...makePosLineItem(1, 100, 100),
					subtotal_tax: '20',
					total_tax: '20',
					taxes: [{ id: 1, total: '20', subtotal: '20' }],
					...(!hasPosData && { meta_data: [] }),
				};
				const input = makeInput({
					lineItems: [item],
					couponLines: codes.map(makeCouponLine),
					couponConfigs: new Map(
						codes.map((code) => [
							code,
							makeConfig({ discount_type: kind === 'fixed_cart' ? 'fixed_cart' : 'percent' }),
						])
					),
					taxRates: [{ id: 1, rate: '20', compound: false, order: 1, class: 'standard' }],
				});
				const result = recalculateCoupons({ ...input, vatExempt: true });
				expect(result.lineItems[0]).toMatchObject({
					total: kind === 'none' ? '100' : kind === 'stacked' ? '80' : '90',
					total_tax: '0',
					subtotal_tax: '0',
					taxes: [],
				});
				expect(result.couponLines).toEqual(
					codes.map((code) => ({ ...makeCouponLine(code), discount: '10', discount_tax: '0' }))
				);
				const taxable = recalculateCoupons(input);
				expect(taxable.lineItems[0]).toMatchObject({
					total: kind === 'none' ? '100' : kind === 'stacked' ? '80' : '90',
					total_tax: kind === 'none' ? '20' : kind === 'stacked' ? '16' : '18',
					subtotal_tax: '20',
				});
				expect(taxable.couponLines).toEqual(
					codes.map((code) => ({ ...makeCouponLine(code), discount: '10', discount_tax: '2' }))
				);
			}
		}
	);
});
