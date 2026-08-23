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

/**
 * The woocommerce-pos#1548 shape, lifted from
 * `order-math/src/internal/coupons/compound-tax-priority.test.ts`.
 *
 * Deliberately NOT the shape the retired oracle's compound case used. That one had a
 * single compound rate with distinct `order` values and no `priority`, so it exercised
 * compound ARITHMETIC and never touched the sequencing bug. The trap is two COMPOUND
 * rates whose `order` is tied at 0 — which is what real stores look like — differentiated
 * only by `priority`, because `priority` is what WC_Tax actually sorts by. Get the
 * ordering wrong and the per-rate split redistributes while the totals still match, so
 * only the cashier's "your store changed this order's totals" banner exposes it.
 */
const compoundPriorityRates: TaxRateInput[] = [
	{
		id: 10,
		name: 'VAT',
		rate: '20.0000',
		compound: true,
		priority: 1,
		order: 0,
		class: 'standard',
	},
	{
		id: 7,
		name: 'Surcharge',
		rate: '2.0000',
		compound: true,
		priority: 2,
		order: 0,
		class: 'standard',
	},
];

function makeConfig(
	pricesIncludeTax: boolean,
	overrides: Partial<Parameters<typeof createCartConfig>[0]> = {}
): CartConfig {
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
		...overrides,
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

function buildShippingLine(amount: number, config: CartConfig) {
	return calculateCartLine(
		{
			kind: 'shipping',
			line: { method_id: 'flat_rate', method_title: 'Flat rate', meta_data: [] },
			changes: { amount, tax_status: 'taxable', prices_include_tax: config.pricesIncludeTax },
		},
		config
	).line;
}

interface ScenarioOptions {
	withPercentFee?: boolean;
	/** Overrides handed straight to `makeConfig` — rates, dp, taxRoundAtSubtotal, ... */
	config?: Partial<Parameters<typeof createCartConfig>[0]>;
	/**
	 * Proves this scenario exercised the DIMENSION it is named for, not merely that two
	 * compositions agreed. A differential is agreement-shaped: it stays green when a
	 * fixture quietly degenerates, so each config dimension asserts its own fingerprint
	 * on the settled patch before the comparison is believed.
	 */
	vouch?: (patch: Record<string, unknown>) => void;
	/**
	 * Add a tombstone alongside the active entry in every one of the four line arrays.
	 * Tombstones must be carried through untouched and contribute nothing to the totals;
	 * a settle pass that computed over one, or dropped it, diverges from the composition.
	 */
	withTombstones?: boolean;
}

function scenario(
	name: string,
	pricesIncludeTax: boolean,
	coupons: CouponInput[],
	codes: string[],
	options: ScenarioOptions = {}
) {
	const config = makeConfig(pricesIncludeTax, options.config);
	const lineItems = [buildLineItem(11, 60, config), buildLineItem(12, 39.99, config)];
	const feeLines = options.withPercentFee ? [buildPercentFee(lineItems, config)] : [];
	const couponLines = codes.map(couponLine);

	if (!options.withTombstones) {
		return {
			name,
			config,
			snapshot: {
				line_items: lineItems,
				fee_lines: feeLines,
				shipping_lines: [],
				coupon_lines: couponLines,
			},
			context: couponContext(coupons),
			vouch: options.vouch,
		};
	}

	/**
	 * Tombstones that CARRY STALE MONEY, ported from the retired oracle's case 7.
	 *
	 * A bare `{ product_id: null }` is a worthless fixture here: it sums to nothing, so
	 * every filter that is supposed to exclude it looks correct even when removed. A real
	 * tombstone is a line that WAS active and still holds its old totals — which is the
	 * entire reason the filters exist. These numbers are what a mishandled tombstone would
	 * leak into the aggregate.
	 */
	return {
		name,
		config,
		snapshot: {
			line_items: [
				...lineItems,
				{
					product_id: null,
					quantity: 1,
					total: '15',
					total_tax: '3',
					subtotal: '15',
					subtotal_tax: '3',
					tax_class: '',
					taxes: [{ id: 1, subtotal: '3', total: '3' }],
					meta_data: [],
				} as LineItemInput,
			],
			fee_lines: [
				...feeLines,
				{ name: null, total: '2', total_tax: '0.4', taxes: [], meta_data: [] } as FeeLineInput,
			],
			shipping_lines: [
				buildShippingLine(7.5, config),
				{
					method_id: null,
					method_title: 'Old shipping',
					total: '5',
					total_tax: '1',
					taxes: [],
					meta_data: [],
				},
			],
			coupon_lines: [
				...couponLines,
				{ code: null, discount: '2.5', discount_tax: '0.5', meta_data: [] } as CouponLineInput,
			],
		},
		context: couponContext(coupons),
		vouch: options.vouch,
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
		{ withPercentFee: true }
	),
	scenario('no coupons / tax-inclusive', true, [], []),

	// ── config dimensions inherited from the retired settle.oracle.test.ts ──────────
	// Each was covered against the internals individually; what the oracle uniquely did
	// was run them through settleCart's WHOLE composition. That is what these restore,
	// and now against a composition that actually ships (the per-line hooks are gone).
	scenario(
		'compound rates tied on `order`, sequenced by `priority` (#1548) / tax-inclusive',
		true,
		[coupon('ten', 'percent', '10')],
		['ten'],
		{
			config: { rates: compoundPriorityRates, allRates: compoundPriorityRates },
			// Both compound rates have to be live, or "compound" is only in the name.
			vouch: (patch) => {
				const taxLines = patch.tax_lines as { rate_id?: number; tax_total?: string }[];
				expect(taxLines.map((line) => line.rate_id).sort((a, b) => Number(a) - Number(b))).toEqual([
					7, 10,
				]);
				for (const line of taxLines) expect(Number(line.tax_total)).toBeGreaterThan(0);
			},
		}
	),
	scenario(
		'dp = 0 (JPY-style) with a 25% coupon / tax-exclusive',
		false,
		[coupon('quarter', 'percent', '25')],
		['quarter'],
		{
			config: { dp: 0 },
			// dp=0 means whole units. A fractional total would mean dp never took effect.
			vouch: (patch) => {
				expect(String(patch.total)).toMatch(/^\d+$/);
				expect(String(patch.total_tax)).toMatch(/^\d+$/);
			},
		}
	),
	scenario(
		'taxRoundAtSubtotal = true with a 15% coupon and a percent fee / tax-exclusive',
		false,
		[coupon('fifteen', 'percent', '15')],
		['fifteen'],
		{ withPercentFee: true, config: { taxRoundAtSubtotal: true } }
	),
	scenario(
		'tombstones in all four arrays alongside active entries and an active coupon',
		false,
		[coupon('ten', 'percent', '10')],
		['ten'],
		{
			withPercentFee: true,
			withTombstones: true,
			/**
			 * The tombstones must contribute NOTHING. Their stale money is known
			 * (15 + 2 + 5 in totals, 3 + 0.4 + 1 in tax, 2.5 discount), so if any of it
			 * leaked into the aggregate the differential would diverge — but only because
			 * the two sides reach the filter differently: settle hands `calculateOrderTotals`
			 * the FULL arrays and relies on its internal filtering, while the composition
			 * pre-filters. That asymmetry is exactly what this scenario pins.
			 */
			vouch: (patch) => {
				expect(patch.shipping_total).toBe('7.5');
				expect(Number(patch.discount_total)).toBeLessThan(15);
			},
		}
	),
];

it('settleCart matches the live composition field-for-field across the cutover fixtures', () => {
	for (const { name, snapshot, config, context, vouch } of scenarios) {
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
			/**
			 * Vouch the fixture before trusting the agreement. Two compositions agree
			 * trivially on an empty cart, so a scenario whose snapshot silently built
			 * nothing — a rate list that matches no line, a coupon code that resolves to
			 * no discount — would read as PASSING evidence for a dimension it never
			 * exercised. Each scenario has to have moved real money first.
			 */
			expect(Number(settledPatch.total)).toBeGreaterThan(0);
			expect(Number(settledPatch.total_tax)).toBeGreaterThan(0);
			if (snapshot.coupon_lines.some((line) => line.code != null)) {
				expect(Number(settledPatch.discount_total)).toBeGreaterThan(0);
			}
			vouch?.(settledPatch as unknown as Record<string, unknown>);

			expect(settledPatch).toEqual(legacyPatch);
		} catch (error) {
			throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
});
