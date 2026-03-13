/**
 * @jest-environment node
 *
 * Integration tests that simulate the full coupon flow:
 *   calculateCouponDiscount → computeDiscountedLineItems → calculateCouponDiscountTaxSplit
 *
 * Each test case uses real order data from the POS and compares
 * the result against the WooCommerce server response.
 */
import { calculateCouponDiscount } from './coupon-discount';
import {
	calculateCouponDiscountTaxSplit,
	computeDiscountedLineItems,
	convertDiscountsToExTax,
	type CouponLineItem,
} from './coupon-helpers';

// 10% compound tax rate (matches wcpos.local tax_id=4)
const taxRates = [{ id: 4, rate: '10', compound: true, order: 1, class: 'standard' }];

/**
 * Helper: run the full coupon pipeline matching how use-add-coupon.ts works.
 *
 * 1. Build CouponLineItem[] from order line items (price = subtotal / qty)
 * 2. calculateCouponDiscount → perItem discounts
 * 3. computeDiscountedLineItems → apply discounts to line items
 * 4. calculateCouponDiscountTaxSplit → coupon_line discount/discount_tax
 */
function applyCoupon(
	lineItems: {
		product_id: number;
		quantity: number;
		total: string;
		total_tax: string;
		subtotal: string;
		subtotal_tax: string;
		tax_class: string;
		taxes: { id: number; subtotal: string; total: string }[];
	}[],
	couponConfig: {
		discount_type: 'percent' | 'fixed_cart' | 'fixed_product';
		amount: string;
		exclude_sale_items?: boolean;
	},
	pricesIncludeTax: boolean
) {
	// Build CouponLineItem — same as use-add-coupon.ts line 112-123
	const couponLineItems: CouponLineItem[] = lineItems.map((item) => {
		const qty = item.quantity || 1;
		return {
			product_id: item.product_id,
			quantity: qty,
			price: parseFloat(item.subtotal || '0') / qty,
			subtotal: item.subtotal || '0',
			total: item.total || '0',
			categories: [],
			on_sale: false,
		};
	});

	const discountResult = calculateCouponDiscount(
		{
			discount_type: couponConfig.discount_type,
			amount: couponConfig.amount,
			limit_usage_to_x_items: null,
			product_ids: [],
			excluded_product_ids: [],
			product_categories: [],
			excluded_product_categories: [],
			exclude_sale_items: couponConfig.exclude_sale_items || false,
		},
		couponLineItems
	);

	const exTaxPerItem = convertDiscountsToExTax(
		discountResult.perItem,
		lineItems,
		couponConfig.discount_type,
		pricesIncludeTax
	);

	const discountedLineItems = computeDiscountedLineItems(lineItems, [exTaxPerItem]);

	const { discount, discount_tax } = calculateCouponDiscountTaxSplit(
		exTaxPerItem,
		lineItems,
		taxRates
	);

	return { discountedLineItems, discount, discount_tax, discountResult };
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
		const lineItems = [
			{
				product_id: 71,
				quantity: 1,
				total: '22.727273',
				total_tax: '2.272727',
				subtotal: '22.727273',
				subtotal_tax: '2.272727',
				tax_class: '',
				taxes: [{ id: 4, subtotal: '2.272727', total: '2.272727' }],
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
			},
		];

		const { discountedLineItems, discount, discount_tax, discountResult } = applyCoupon(
			lineItems,
			{ discount_type: 'fixed_cart', amount: '10' },
			true
		);

		// The coupon distributes $10 total across items
		expect(discountResult.totalDiscount).toBeCloseTo(10, 4);

		// Coupon line: discount + discount_tax should equal $10 (tax-inclusive)
		const couponTotal = parseFloat(discount) + parseFloat(discount_tax);
		expect(couponTotal).toBeCloseTo(10, 2);

		// Each line item total + tax should be reduced
		const grandTotal = discountedLineItems.reduce((sum, item) => {
			return sum + parseFloat(item.total) + parseFloat(item.total_tax);
		}, 0);

		// Cart was $105 inc tax, minus $10 coupon = $95
		expect(grandTotal).toBeCloseTo(95, 1);

		// Individual line items should all have reduced totals
		for (const item of discountedLineItems) {
			expect(parseFloat(item.total)).toBeLessThan(parseFloat(item.subtotal));
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
		const lineItems = [
			{
				product_id: 60,
				quantity: 1,
				total: '16.363636',
				total_tax: '1.636364',
				subtotal: '16.363636',
				subtotal_tax: '1.636364',
				tax_class: '',
				taxes: [{ id: 4, subtotal: '1.636364', total: '1.636364' }],
			},
		];

		const { discountedLineItems, discount, discount_tax } = applyCoupon(
			lineItems,
			{ discount_type: 'fixed_product', amount: '3' },
			true
		);

		const itemTotal =
			parseFloat(discountedLineItems[0].total) + parseFloat(discountedLineItems[0].total_tax);

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
		const lineItems = [
			{
				product_id: 1,
				quantity: 1,
				total: '50',
				total_tax: '5',
				subtotal: '50',
				subtotal_tax: '5',
				tax_class: '',
				taxes: [{ id: 4, subtotal: '5', total: '5' }],
			},
		];

		const { discountedLineItems } = applyCoupon(
			lineItems,
			{ discount_type: 'fixed_cart', amount: '10' },
			false
		);

		// $50 - $10 = $40 ex-tax
		expect(parseFloat(discountedLineItems[0].total)).toBeCloseTo(40, 4);
		// Tax scales proportionally: $5 * (40/50) = $4
		expect(parseFloat(discountedLineItems[0].total_tax)).toBeCloseTo(4, 4);
	});

	/**
	 * Percent coupon with tax-inclusive pricing.
	 *
	 * Item: $22 inc 10% tax → ex-tax $20, tax $2
	 * Coupon: 50% off
	 * Expected: $11 inc tax → ex-tax $10, tax $1
	 */
	it('50% percent coupon with tax-inclusive pricing', () => {
		const lineItems = [
			{
				product_id: 1,
				quantity: 1,
				total: '20',
				total_tax: '2',
				subtotal: '20',
				subtotal_tax: '2',
				tax_class: '',
				taxes: [{ id: 4, subtotal: '2', total: '2' }],
			},
		];

		const { discountedLineItems, discount, discount_tax } = applyCoupon(
			lineItems,
			{ discount_type: 'percent', amount: '50' },
			true
		);

		// 50% of 20 ex-tax = 10 discount. With tax extraction: 10/1.1 = 9.0909 ex-tax
		const newTotal = parseFloat(discountedLineItems[0].total);
		const newTax = parseFloat(discountedLineItems[0].total_tax);

		// $22 * 50% = $11 inc tax
		expect(newTotal + newTax).toBeCloseTo(11, 2);

		// Coupon line: discount = $10 (ex-tax), discount_tax = $1
		expect(parseFloat(discount)).toBeCloseTo(10, 2);
		expect(parseFloat(discount_tax)).toBeCloseTo(1, 2);
	});
});
