/** @jest-environment node */
import {
	calculateCartLine,
	type CartConfig,
	type CartSnapshot,
	type CouponContext,
	type CouponInput,
	type CouponLineInput,
	createCartConfig,
	type FeeLineInput,
	type LineItemInput,
	settleCart,
	type TaxRateInput,
} from '@wcpos/order-math';
import { type CouponDiscountConfig, extractFeeLineData } from '@wcpos/order-math/internal';

import { calculateOrderTotals } from './calculate-order-totals';
import { recalculateCoupons } from './coupon-recalculate';

type DbFeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
type DbLineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type DbCouponLine = NonNullable<import('@wcpos/database').OrderDocument['coupon_lines']>[number];

const exclusiveRates: TaxRateInput[] = [
	{
		id: 1,
		name: 'VAT',
		rate: '20',
		compound: false,
		order: 1,
		class: 'standard',
	},
];
const inclusiveRates: TaxRateInput[] = [
	{
		id: 2,
		name: 'GST',
		rate: '10',
		compound: false,
		order: 1,
		class: 'standard',
	},
];

function makeConfig(pricesIncludeTax: boolean): CartConfig {
	const rates = pricesIncludeTax ? inclusiveRates : exclusiveRates;
	return createCartConfig({
		rates,
		allRates: rates,
		calcTaxes: true,
		pricesIncludeTax,
		taxRoundAtSubtotal: false,
		dp: 2,
		shippingTaxClass: '',
		calcDiscountsSequentially: false,
	});
}

function buildLineItem(productId: number, price: number, config: CartConfig): LineItemInput {
	return calculateCartLine(
		{
			kind: 'line_item',
			line: {
				product_id: productId,
				quantity: 1,
				tax_class: '',
				meta_data: [],
			},
			changes: { price, regular_price: price },
		},
		config
	).line;
}

function buildPercentFee(lineItems: LineItemInput[], config: CartConfig): FeeLineInput {
	return calculateCartLine(
		{
			kind: 'fee',
			line: { name: '10% service', tax_status: 'taxable', tax_class: '' },
			changes: {
				amount: 10,
				percent: true,
				prices_include_tax: config.pricesIncludeTax,
				percent_of_cart_total_with_tax: false,
			},
			cartLineItems: lineItems,
		},
		config
	).line;
}

function couponLine(code: string): CouponLineInput {
	return { code, discount: '0', discount_tax: '0', meta_data: [] };
}

const coupon = (
	code: string,
	discount_type: CouponInput['discount_type'],
	amount: string
): CouponInput => ({ code, discount_type, amount });

function couponContext(coupons: CouponInput[]): CouponContext {
	return {
		coupons: new Map(coupons.map((coupon) => [coupon.code.toLowerCase(), coupon])),
		productCategories: new Map(),
		categoryParents: new Map(),
	};
}

function toLegacyCouponConfigs(context: CouponContext): Map<string, CouponDiscountConfig> {
	return new Map(
		[...context.coupons].map(([code, coupon]) => [
			code,
			{
				discount_type: coupon.discount_type,
				amount: coupon.amount,
				limit_usage_to_x_items: coupon.limit_usage_to_x_items ?? null,
				product_ids: [...(coupon.product_ids ?? [])],
				excluded_product_ids: [...(coupon.excluded_product_ids ?? [])],
				product_categories: [...(coupon.product_categories ?? [])],
				excluded_product_categories: [...(coupon.excluded_product_categories ?? [])],
				exclude_sale_items: coupon.exclude_sale_items ?? false,
			},
		])
	);
}

function legacyConvergedPatch(snapshot: CartSnapshot, config: CartConfig, context: CouponContext) {
	let lineItems = [...(snapshot.line_items ?? [])] as DbLineItem[];
	let feeLines = [...(snapshot.fee_lines ?? [])];
	let couponLines = [...(snapshot.coupon_lines ?? [])] as DbCouponLine[];

	for (let pass = 0; pass < 10; pass++) {
		const before = JSON.stringify({ lineItems, feeLines, couponLines });
		feeLines = feeLines.map((feeLine) => {
			const { percent } = extractFeeLineData(feeLine as DbFeeLine, config.pricesIncludeTax);
			if (feeLine.name === null || !percent) return feeLine;
			return calculateCartLine({ kind: 'fee', line: feeLine, cartLineItems: lineItems }, config)
				.line;
		});

		if (couponLines.some((line) => line.code != null)) {
			const replay = recalculateCoupons({
				lineItems,
				couponLines,
				couponConfigs: toLegacyCouponConfigs(context),
				pricesIncludeTax: config.pricesIncludeTax,
				calcDiscountsSequentially: config.calcDiscountsSequentially,
				taxRates: [...config.rates] as {
					id: number;
					rate: string;
					compound: boolean;
					order: number;
					class?: string;
				}[],
				productCategories: new Map(),
				taxRoundAtSubtotal: config.taxRoundAtSubtotal,
				dp: config.dp,
			});
			lineItems = replay.lineItems;
			couponLines = replay.couponLines;
		}

		if (JSON.stringify({ lineItems, feeLines, couponLines }) === before) break;
	}

	const totals = calculateOrderTotals({
		lineItems: lineItems.filter((item) => item.product_id !== null),
		feeLines: feeLines.filter((item) => item.name !== null),
		shippingLines: [...(snapshot.shipping_lines ?? [])].filter((item) => item.method_id !== null),
		couponLines: couponLines.filter((item) => item.code != null),
		taxRates: [...config.allRates],
		taxRoundAtSubtotal: config.taxRoundAtSubtotal,
		dp: config.dp,
		pricesIncludeTax: config.pricesIncludeTax,
	});

	return {
		discount_total: totals.discount_total,
		discount_tax: totals.discount_tax,
		shipping_total: totals.shipping_total,
		shipping_tax: totals.shipping_tax,
		cart_tax: totals.cart_tax,
		total_tax: totals.total_tax,
		total: totals.total,
		tax_lines: totals.tax_lines,
		line_items: lineItems,
		coupon_lines: couponLines,
	};
}

function scenario(
	name: string,
	pricesIncludeTax: boolean,
	coupons: CouponInput[],
	codes: string[],
	withPercentFee = false
) {
	const config = makeConfig(pricesIncludeTax);
	const lineItems = [buildLineItem(11, 60, config), buildLineItem(12, 39.99, config)];
	return {
		name,
		config,
		snapshot: {
			line_items: lineItems,
			fee_lines: withPercentFee ? [buildPercentFee(lineItems, config)] : [],
			shipping_lines: [],
			coupon_lines: codes.map(couponLine),
		},
		context: couponContext(coupons),
	};
}

const scenarios = [
	scenario('no coupons / tax-exclusive', false, [], []),
	scenario('one percent coupon / tax-exclusive', false, [coupon('ten', 'percent', '10')], ['ten']),
	scenario(
		'one fixed_cart coupon / tax-exclusive',
		false,
		[coupon('five', 'fixed_cart', '5')],
		['five']
	),
	scenario(
		'two stacked coupons / tax-inclusive',
		true,
		[coupon('ten', 'percent', '10'), coupon('five', 'fixed_cart', '5')],
		['ten', 'five']
	),
	scenario(
		'percent fee rebased to the coupon-converged fixed point / tax-exclusive',
		false,
		[coupon('half', 'percent', '50')],
		['half'],
		true
	),
	scenario('no coupons / tax-inclusive', true, [], []),
];

it('settleCart matches the live composition field-for-field across the cutover fixtures', () => {
	for (const { name, snapshot, config, context } of scenarios) {
		const legacyPatch = legacyConvergedPatch(snapshot, config, context);
		const settled = settleCart(snapshot, config, { coupons: context });

		if (!settled.ok) {
			throw new Error(`${name}: settleCart failed: ${JSON.stringify(settled.error)}`);
		}

		const settledPatch = {
			discount_total: settled.patch.discount_total,
			discount_tax: settled.patch.discount_tax,
			shipping_total: settled.patch.shipping_total,
			shipping_tax: settled.patch.shipping_tax,
			cart_tax: settled.patch.cart_tax,
			total_tax: settled.patch.total_tax,
			total: settled.patch.total,
			tax_lines: settled.patch.tax_lines,
			line_items: settled.patch.line_items ?? snapshot.line_items,
			coupon_lines: settled.patch.coupon_lines ?? snapshot.coupon_lines,
		};

		try {
			expect(settledPatch).toEqual(legacyPatch);
		} catch (error) {
			throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
});
