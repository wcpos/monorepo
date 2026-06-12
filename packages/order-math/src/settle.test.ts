/**
 * @jest-environment node
 *
 * settleCart — the one-pass settle pipeline (SPEC §3/§4).
 *
 * Pins: frozen regime (no array keys), the missing_coupon gate, replay parity
 * with recalculateCoupons, percent fees on the post-replay basis, idempotence
 * + `changed`, the tombstone law, and the validate option.
 */
import { createCartConfig } from './config';
import { calculateOrderTotals } from './internal/order-totals';
import { recalculateCoupons } from './internal/coupons/recalculate';
import { getOrderTotals } from './order-totals';
import { settleCart } from './settle';

import type { CartConfigInput } from './config';
import type { CartSnapshot } from './snapshot';
import type { CouponContext, CouponInput, FeeLineInput, LineItemInput } from './types';

const FIXED_NOW = Date.UTC(2026, 0, 15);

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const makeConfig = (overrides: Partial<CartConfigInput> = {}) =>
	createCartConfig({
		rates: [],
		allRates: [],
		calcTaxes: true,
		pricesIncludeTax: false,
		taxRoundAtSubtotal: false,
		dp: 2,
		shippingTaxClass: '',
		calcDiscountsSequentially: false,
		...overrides,
	});

/** A frozen-regime line item carrying `_woocommerce_pos_data` (price = regular). */
const makePosLineItem = (
	productId: number,
	price: number,
	regularPrice: number = price,
	qty = 1
): LineItemInput => ({
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
				tax_status: 'taxable',
			}),
		},
	],
});

const makeCouponLine = (code: string | null) => ({
	code,
	discount: '0',
	discount_tax: '0',
	meta_data: [],
});

const makeCouponInput = (overrides: Partial<CouponInput> & { code: string }): CouponInput => ({
	discount_type: 'percent',
	amount: '10',
	...overrides,
});

const makeCouponContext = (coupons: CouponInput[]): CouponContext => ({
	coupons: new Map(coupons.map((c) => [c.code.toLowerCase(), c])),
	productCategories: new Map(),
});

const makePercentFee = (amount: number): FeeLineInput => ({
	name: 'Percent Fee',
	tax_class: '',
	tax_status: 'taxable',
	total: '0',
	total_tax: '0',
	taxes: [],
	meta_data: [
		{
			key: '_woocommerce_pos_data',
			value: JSON.stringify({
				amount,
				percent: true,
				prices_include_tax: false,
				percent_of_cart_total_with_tax: false,
			}),
		},
	],
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('settleCart', () => {
	// -----------------------------------------------------------------------
	// 1. Frozen regime
	// -----------------------------------------------------------------------
	describe('frozen regime (no coupons)', () => {
		const rates = [
			{
				id: 1,
				name: 'Tax',
				rate: '10',
				compound: false,
				order: 1,
				class: 'standard',
				shipping: true,
			},
		];
		const config = makeConfig({ rates, allRates: rates });

		const snapshot: CartSnapshot = {
			line_items: [
				{
					product_id: 1,
					quantity: 1,
					subtotal: '100',
					subtotal_tax: '10',
					total: '100',
					total_tax: '10',
					taxes: [{ id: 1, subtotal: '10', total: '10' }],
					meta_data: [],
				},
				{
					product_id: 2,
					quantity: 1,
					subtotal: '50',
					subtotal_tax: '5',
					total: '50',
					total_tax: '5',
					taxes: [{ id: 1, subtotal: '5', total: '5' }],
					meta_data: [],
				},
			],
			fee_lines: [
				{
					name: 'Handling',
					tax_class: '',
					tax_status: 'taxable',
					total: '10',
					total_tax: '1',
					taxes: [{ id: 1, total: '1' }],
					meta_data: [],
				},
			],
			shipping_lines: [
				{
					method_id: 'flat_rate',
					method_title: 'Flat rate',
					total: '20',
					total_tax: '2',
					taxes: [{ id: 1, total: '2' }],
					meta_data: [],
				},
			],
			coupon_lines: [],
		};

		it('emits totals only — no line_items/coupon_lines/fee_lines keys', () => {
			const before = clone(snapshot);
			const result = settleCart(snapshot, config);

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect('line_items' in result.patch).toBe(false);
			expect('coupon_lines' in result.patch).toBe(false);
			expect('fee_lines' in result.patch).toBe(false);

			// totals fields match the read model exactly
			const expected = getOrderTotals(snapshot, config);
			expect(result.totals).toEqual(expected);
			expect(result.patch.discount_total).toBe(expected.discount_total);
			expect(result.patch.discount_tax).toBe(expected.discount_tax);
			expect(result.patch.shipping_total).toBe(expected.shipping_total);
			expect(result.patch.shipping_tax).toBe(expected.shipping_tax);
			expect(result.patch.cart_tax).toBe(expected.cart_tax);
			expect(result.patch.total).toBe(expected.total);
			expect(result.patch.total_tax).toBe(expected.total_tax);
			expect(result.patch.tax_lines).toEqual(expected.tax_lines);

			// inputs untouched
			expect(snapshot).toEqual(before);
		});
	});

	// -----------------------------------------------------------------------
	// 2. missing_coupon gate
	// -----------------------------------------------------------------------
	describe('missing_coupon gate', () => {
		const config = makeConfig();
		const snapshot: CartSnapshot = {
			line_items: [makePosLineItem(1, 100)],
			coupon_lines: [makeCouponLine('save10')],
		};

		it('fails when no options are given at all', () => {
			const result = settleCart(snapshot, config);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toEqual({ code: 'missing_coupon', missingCodes: ['save10'] });
			expect(result.warnings).toEqual([]);
		});

		it('fails when the coupon context map is empty', () => {
			const result = settleCart(snapshot, config, {
				coupons: { coupons: new Map(), productCategories: new Map() },
			});
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toEqual({ code: 'missing_coupon', missingCodes: ['save10'] });
			expect(result.warnings).toEqual([]);
		});
	});

	// -----------------------------------------------------------------------
	// 3. Replay parity with recalculateCoupons
	// -----------------------------------------------------------------------
	describe('coupon replay parity', () => {
		it('patch.line_items/coupon_lines deep-equal recalculateCoupons output (10% on $100)', () => {
			// Fixture from recalculate.test.ts: "should apply a 10% percentage coupon to a $100 item"
			const lineItem = makePosLineItem(1, 100, 100);
			const couponLine = makeCouponLine('ten');
			const config = makeConfig();
			const context = makeCouponContext([
				makeCouponInput({ code: 'ten', discount_type: 'percent', amount: '10' }),
			]);

			const snapshot: CartSnapshot = {
				line_items: [lineItem],
				coupon_lines: [couponLine],
			};
			const result = settleCart(snapshot, config, { coupons: context });
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			const expectedReplay = recalculateCoupons({
				lineItems: [clone(lineItem)],
				couponLines: [clone(couponLine)],
				couponConfigs: new Map([
					[
						'ten',
						{
							discount_type: 'percent' as const,
							amount: '10',
							limit_usage_to_x_items: null,
							product_ids: [],
							excluded_product_ids: [],
							product_categories: [],
							excluded_product_categories: [],
							exclude_sale_items: false,
						},
					],
				]),
				pricesIncludeTax: false,
				calcDiscountsSequentially: false,
				taxRates: [],
				productCategories: new Map(),
				taxRoundAtSubtotal: false,
				dp: 2,
			});

			expect(result.patch.line_items).toEqual(expectedReplay.lineItems);
			expect(result.patch.coupon_lines).toEqual(expectedReplay.couponLines);
			expect(result.patch.coupon_lines![0].discount).toBe('10');
			expect(parseFloat(result.patch.line_items![0].total!)).toBeCloseTo(90, 2);

			const expectedTotals = calculateOrderTotals({
				lineItems: expectedReplay.lineItems,
				feeLines: [],
				shippingLines: [],
				couponLines: expectedReplay.couponLines,
				taxRates: [],
				taxRoundAtSubtotal: false,
				dp: 2,
				pricesIncludeTax: false,
			});
			expect(result.totals).toEqual(expectedTotals);
		});
	});

	// -----------------------------------------------------------------------
	// 4. Percent fee on the post-replay basis
	// -----------------------------------------------------------------------
	describe('percent fees on the post-replay basis', () => {
		const config = makeConfig();
		const context = makeCouponContext([
			makeCouponInput({ code: 'half', discount_type: 'percent', amount: '50' }),
		]);
		const snapshot: CartSnapshot = {
			line_items: [makePosLineItem(1, 100)],
			coupon_lines: [makeCouponLine('half')],
			fee_lines: [makePercentFee(10)],
		};

		it('computes the 10% fee from the 50%-discounted line totals', () => {
			const before = clone(snapshot);
			const result = settleCart(snapshot, config, { coupons: context });
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			// 50% coupon: $100 -> $50; 10% fee of the DISCOUNTED basis = $5
			expect(result.patch.line_items![0].total).toBe('50');
			expect(result.patch.coupon_lines![0].discount).toBe('50');
			expect(result.patch.fee_lines).toHaveLength(1);
			expect(result.patch.fee_lines![0].total).toBe('5');
			expect(result.patch.total).toBe('55');
			expect(result.patch.discount_total).toBe('50');

			// inputs untouched through the replay + fee path
			expect(snapshot).toEqual(before);
		});
	});

	// -----------------------------------------------------------------------
	// 5. Idempotence + changed
	// -----------------------------------------------------------------------
	describe('idempotence and changed', () => {
		const config = makeConfig();
		const context = makeCouponContext([
			makeCouponInput({ code: 'half', discount_type: 'percent', amount: '50' }),
		]);
		const snapshot: CartSnapshot = {
			line_items: [makePosLineItem(1, 100)],
			coupon_lines: [makeCouponLine('half')],
			fee_lines: [makePercentFee(10)],
		};

		it('first settle on a totals-less snapshot reports changed: true', () => {
			const result = settleCart(snapshot, config, { coupons: context });
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.changed).toBe(true);
		});

		it('settling the applied patch returns a value-identical patch with changed: false', () => {
			const first = settleCart(snapshot, config, { coupons: context });
			expect(first.ok).toBe(true);
			if (!first.ok) return;

			const applied: CartSnapshot = { ...snapshot, ...first.patch };
			const second = settleCart(applied, config, { coupons: context });
			expect(second.ok).toBe(true);
			if (!second.ok) return;

			expect(second.patch).toEqual(first.patch);
			expect(second.changed).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// 6. Tombstone law
	// -----------------------------------------------------------------------
	describe('tombstone law', () => {
		const config = makeConfig();
		const context = makeCouponContext([
			makeCouponInput({ code: 'ten', discount_type: 'percent', amount: '10' }),
		]);

		const tombstoneLineItem: LineItemInput = {
			product_id: null,
			quantity: 1,
			subtotal: '20',
			subtotal_tax: '0',
			total: '20',
			total_tax: '0',
			taxes: [],
			meta_data: [],
		};
		const tombstoneFee: FeeLineInput = {
			name: null,
			total: '5',
			total_tax: '0',
			taxes: [],
			meta_data: [],
		};
		const tombstoneCoupon = makeCouponLine(null);

		const snapshot: CartSnapshot = {
			line_items: [makePosLineItem(1, 100), tombstoneLineItem],
			fee_lines: [makePercentFee(10), tombstoneFee],
			coupon_lines: [tombstoneCoupon, makeCouponLine('ten')],
		};

		it('passes tombstones through in place, byte-identical, excluded from math', () => {
			const result = settleCart(snapshot, config, { coupons: context });
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			// tombstones at their original positions, byte-identical
			expect(JSON.stringify(result.patch.line_items![1])).toBe(JSON.stringify(tombstoneLineItem));
			expect(JSON.stringify(result.patch.fee_lines![1])).toBe(JSON.stringify(tombstoneFee));
			expect(JSON.stringify(result.patch.coupon_lines![0])).toBe(JSON.stringify(tombstoneCoupon));
			expect(result.patch.line_items).toHaveLength(2);
			expect(result.patch.fee_lines).toHaveLength(2);
			expect(result.patch.coupon_lines).toHaveLength(2);

			// excluded from all math: 10% of the ACTIVE $100 line only
			expect(result.patch.coupon_lines![1].discount).toBe('10');
			expect(result.patch.line_items![0].total).toBe('90');
			// percent fee basis excludes the tombstoned line: 10% of $90
			expect(result.patch.fee_lines![0].total).toBe('9');
			// totals exclude tombstoned line ($20), fee ($5), coupon discount
			expect(result.patch.total).toBe('99');
			expect(result.patch.discount_total).toBe('10');
		});
	});

	// -----------------------------------------------------------------------
	// 7. validate option
	// -----------------------------------------------------------------------
	describe('validate option', () => {
		const config = makeConfig();
		const snapshot: CartSnapshot = {
			line_items: [makePosLineItem(1, 100)],
			coupon_lines: [],
			billing: { email: 'shopper@example.com' },
			customer_id: 42,
		};

		it('accepts a valid candidate', () => {
			const context = makeCouponContext([
				makeCouponInput({
					code: 'newcode',
					discount_type: 'percent',
					amount: '10',
					date_expires_gmt: '2026-02-01T00:00:00',
					usage_limit: 10,
					usage_count: 1,
					usage_limit_per_user: null,
					used_by: [],
					minimum_amount: '',
					maximum_amount: '',
					email_restrictions: [],
				}),
			]);

			const result = settleCart(snapshot, config, {
				coupons: context,
				validate: { codes: ['newcode'], now: FIXED_NOW },
			});
			expect(result.ok).toBe(true);
		});

		it('rejects a duplicate candidate while preserving the existing coupon line', () => {
			const context = makeCouponContext([makeCouponInput({ code: 'save10' })]);
			const result = settleCart(
				{
					...snapshot,
					coupon_lines: [makeCouponLine('save10'), makeCouponLine('save10')],
				},
				config,
				{
					coupons: context,
					validate: { codes: ['save10'], now: FIXED_NOW },
				}
			);

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toEqual({
				code: 'invalid_coupon',
				couponCode: 'save10',
				rejection: { code: 'already_applied' },
			});
		});

		it('rejects an expired candidate with a typed rejection', () => {
			const context = makeCouponContext([
				makeCouponInput({
					code: 'expired10',
					discount_type: 'percent',
					amount: '10',
					date_expires_gmt: '2026-01-01T00:00:00', // before FIXED_NOW
				}),
			]);

			const result = settleCart(snapshot, config, {
				coupons: context,
				validate: { codes: ['expired10'], now: FIXED_NOW },
			});
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toEqual({
				code: 'invalid_coupon',
				couponCode: 'expired10',
				rejection: { code: 'expired' },
			});
		});

		it('reports missing_coupon when the candidate is absent from the context', () => {
			const context = makeCouponContext([makeCouponInput({ code: 'other' })]);

			const result = settleCart(snapshot, config, {
				coupons: context,
				validate: { codes: ['ghost'], now: FIXED_NOW },
			});
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toEqual({ code: 'missing_coupon', missingCodes: ['ghost'] });
		});
	});
});
