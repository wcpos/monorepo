/**
 * @jest-environment node
 *
 * Legacy-convergence oracle: proves `settleCart`'s single pass reproduces the
 * converged state of today's multi-patch write loop (use-cart-lines.ts).
 *
 * The legacy loop, on every cart change:
 *   (1) recomputes each active PERCENT fee line against the CURRENT persisted
 *       line items — pre-replay (stale basis) on the first pass;
 *   (2) replays active coupons over the current lines (recalculateCoupons);
 *   (3) runs calculateOrderTotals and patches everything;
 *   (4) the patch re-triggers the subscription; the second pass recomputes
 *       fees against the now-discounted lines; iteration continues until
 *       nothing changes (in practice ~2 passes).
 *
 * `legacyConvergedState` replays that choreography to its fixed point with the
 * SAME internals settle uses; every scenario asserts settle's one-pass patch
 * equals the loop's final persisted state.
 */
import { calculateCartLine } from './cart-line';
import { createCartConfig } from './config';
import { enrichCategoriesWithAncestors } from './internal/coupons/helpers';
import { recalculateCoupons } from './internal/coupons/recalculate';
import { toCouponConfigs } from './internal/coupons/to-coupon-configs';
import { extractFeeLineData } from './internal/lines/pos-data';
import { calculateOrderTotals } from './internal/order-totals';
import { settleCart } from './settle';
import { isActiveCouponLine, isActiveFeeLine } from './snapshot';

import type { CartConfig, CartConfigInput } from './config';
import type { CartSnapshot } from './snapshot';
import type {
	CouponContext,
	CouponInput,
	CouponLineInput,
	FeeLineInput,
	LineItemInput,
	MoneyString,
	ShippingLineInput,
	TaxRateInput,
} from './types';

// DB element type — used only for the cast at the pos-data helper boundary,
// exactly as settle.ts does it.
type DbFeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];

// Safety bound; the loop converges in <=3 passes for every scenario here.
const MAX_PASSES = 10;

/**
 * Replays today's use-cart-lines.ts choreography to its fixed point:
 *   per pass: (1) percent fees recomputed against CURRENT line items,
 *   (2) coupon replay over current lines, (3) repeat until stable.
 * Totals computed over the converged state — "the final persisted patch".
 *
 * `passes` counts the iterations that actually changed state (the legacy
 * loop's extra patch round-trips); 0 means the snapshot was already converged.
 */
function legacyConvergedState(
	snapshot: CartSnapshot,
	config: CartConfig,
	couponContext?: CouponContext
) {
	let lineItems: LineItemInput[] = [...(snapshot.line_items ?? [])];
	let feeLines: FeeLineInput[] = [...(snapshot.fee_lines ?? [])];
	let couponLines: CouponLineInput[] = [...(snapshot.coupon_lines ?? [])];

	// Category enrichment — once, mirroring settle.ts step 2.
	const enrichedCategories = new Map<number, { id: number }[]>();
	if (couponContext) {
		const direct = new Map<number, { id: number }[]>();
		for (const [productId, categories] of couponContext.productCategories) {
			direct.set(productId, [...categories]);
		}
		const enriched = enrichCategoriesWithAncestors(
			direct,
			new Map(couponContext.categoryParents ?? [])
		);
		for (const [productId, categories] of enriched) {
			enrichedCategories.set(productId, categories);
		}
	}

	let passes = 0;
	for (let pass = 0; pass < MAX_PASSES; pass++) {
		const before = JSON.stringify({ lineItems, feeLines, couponLines });

		// (1) Percent fees against CURRENT lineItems — the loop's stale-basis
		// behavior (pre-replay on the first pass).
		feeLines = feeLines.map((fee) => {
			if (!isActiveFeeLine(fee)) return fee;
			const { percent } = extractFeeLineData(fee as DbFeeLine, config.pricesIncludeTax);
			if (!percent) return fee;
			return calculateCartLine({ kind: 'fee', line: fee, cartLineItems: lineItems }, config).line;
		});

		// (2) Coupon replay over current lines (use-recalculate-coupons.ts).
		if (couponContext && couponLines.some(isActiveCouponLine)) {
			const activeCodes = couponLines
				.filter((cl): cl is CouponLineInput & { code: string } => isActiveCouponLine(cl))
				.map((cl) => cl.code.toLowerCase());
			const result = recalculateCoupons({
				lineItems,
				couponLines,
				couponConfigs: toCouponConfigs(activeCodes, couponContext.coupons),
				pricesIncludeTax: config.pricesIncludeTax,
				calcDiscountsSequentially: config.calcDiscountsSequentially,
				taxRates: [...config.rates] as {
					id: number;
					rate: string;
					compound: boolean;
					order: number;
					class?: string;
				}[],
				productCategories: enrichedCategories,
				taxRoundAtSubtotal: config.taxRoundAtSubtotal,
				dp: config.dp,
			});
			lineItems = result.lineItems;
			couponLines = result.couponLines;
		}

		if (JSON.stringify({ lineItems, feeLines, couponLines }) === before) break;
		passes++;
	}

	// (3) Totals over the converged state — the legacy loop's final patch.
	const totals = calculateOrderTotals({
		lineItems,
		feeLines,
		shippingLines: [...(snapshot.shipping_lines ?? [])],
		couponLines,
		taxRates: [...config.allRates],
		taxRoundAtSubtotal: config.taxRoundAtSubtotal,
		dp: config.dp,
		pricesIncludeTax: config.pricesIncludeTax,
	});

	return { lineItems, feeLines, couponLines, totals, passes };
}

// ===== assertion helpers =====

interface PersistedTotals {
	discount_total: MoneyString;
	discount_tax: MoneyString;
	shipping_total: MoneyString;
	shipping_tax: MoneyString;
	cart_tax: MoneyString;
	total_tax: MoneyString;
	total: MoneyString;
	tax_lines: unknown;
}

/** The 7 persisted money fields + tax_lines — what the legacy loop patches. */
function pickPersisted(totals: PersistedTotals) {
	const {
		discount_total,
		discount_tax,
		shipping_total,
		shipping_tax,
		cart_tax,
		total_tax,
		total,
		tax_lines,
	} = totals;
	return {
		discount_total,
		discount_tax,
		shipping_total,
		shipping_tax,
		cart_tax,
		total_tax,
		total,
		tax_lines,
	};
}

/**
 * The parity assertion: settle's ONE call must reproduce the legacy loop's
 * converged state — totals always; arrays where the patch emits them,
 * otherwise the oracle must not have moved them off the snapshot's originals.
 */
function expectSettleMatchesLegacy(
	snapshot: CartSnapshot,
	config: CartConfig,
	ctx?: CouponContext
) {
	const oracle = legacyConvergedState(snapshot, config, ctx);
	const result = settleCart(snapshot, config, ctx ? { coupons: ctx } : undefined);

	expect(result.ok).toBe(true);
	if (!result.ok) return oracle;

	expect(pickPersisted(result.patch)).toEqual(pickPersisted(oracle.totals));
	expect(result.patch.line_items ?? snapshot.line_items).toEqual(oracle.lineItems);
	expect(result.patch.coupon_lines ?? snapshot.coupon_lines).toEqual(oracle.couponLines);
	expect(result.patch.fee_lines ?? snapshot.fee_lines).toEqual(oracle.feeLines);

	return oracle;
}

// ===== fixture builders (mutation-time calculators — what the app persists) =====

function makeConfig(
	rates: readonly TaxRateInput[],
	overrides: Partial<CartConfigInput> = {}
): CartConfig {
	return createCartConfig({
		rates: [...rates],
		allRates: [...rates],
		calcTaxes: true,
		pricesIncludeTax: false,
		taxRoundAtSubtotal: false,
		dp: 2,
		shippingTaxClass: '',
		calcDiscountsSequentially: false,
		...overrides,
	});
}

/**
 * Build a line item the way the app does on add-to-cart: raw line + price
 * changes through `calculateCartLine`, which writes `_woocommerce_pos_data`
 * (price, regular_price, tax_status) and computes totals/taxes.
 */
function buildLineItem(
	spec: { product_id: number; quantity: number; price: number; regular_price?: number },
	config: CartConfig
): LineItemInput {
	return calculateCartLine(
		{
			kind: 'line_item',
			line: { product_id: spec.product_id, quantity: spec.quantity, tax_class: '', meta_data: [] },
			changes: { price: spec.price, regular_price: spec.regular_price ?? spec.price },
		},
		config
	).line;
}

function buildFixedFee(
	spec: { name: string; amount: number; prices_include_tax: boolean },
	cartLineItems: readonly LineItemInput[],
	config: CartConfig
): FeeLineInput {
	return calculateCartLine(
		{
			kind: 'fee',
			line: { name: spec.name, tax_status: 'taxable', tax_class: '' },
			changes: {
				amount: spec.amount,
				percent: false,
				prices_include_tax: spec.prices_include_tax,
				percent_of_cart_total_with_tax: spec.prices_include_tax,
			},
			cartLineItems,
		},
		config
	).line;
}

/**
 * Percent fee computed against the given basis — pass the PRE-discount line
 * items to model what the app has persisted the moment a coupon is added.
 */
function buildPercentFee(
	spec: {
		name: string;
		percent: number;
		prices_include_tax: boolean;
		percent_of_cart_total_with_tax: boolean;
	},
	cartLineItems: readonly LineItemInput[],
	config: CartConfig
): FeeLineInput {
	return calculateCartLine(
		{
			kind: 'fee',
			line: { name: spec.name, tax_status: 'taxable', tax_class: '' },
			changes: {
				amount: spec.percent,
				percent: true,
				prices_include_tax: spec.prices_include_tax,
				percent_of_cart_total_with_tax: spec.percent_of_cart_total_with_tax,
			},
			cartLineItems,
		},
		config
	).line;
}

function buildShippingLine(
	spec: { method_id: string; method_title: string; amount: number },
	config: CartConfig
): ShippingLineInput {
	return calculateCartLine(
		{
			kind: 'shipping',
			line: { method_id: spec.method_id, method_title: spec.method_title },
			changes: {
				amount: spec.amount,
				tax_status: 'taxable',
				tax_class: '',
				prices_include_tax: false,
			},
		},
		config
	).line;
}

function makeCouponContext(coupons: CouponInput[]): CouponContext {
	return {
		coupons: new Map(coupons.map((coupon) => [coupon.code.toLowerCase(), coupon])),
		productCategories: new Map(),
	};
}

function freshCouponLine(code: string): CouponLineInput {
	// "Just added" persisted state: code set, discount not yet replayed.
	return { code, discount: '0', discount_tax: '0', meta_data: [] };
}

/**
 * Snapshot builder mirroring `snapshotFromOrderJSON`: all four arrays are
 * always materialized (the sanctioned constructor never leaves them
 * undefined), so the "oracle equals the snapshot's originals" assertions
 * compare arrays, not undefined.
 */
function makeSnapshot(parts: {
	line_items: LineItemInput[];
	fee_lines?: FeeLineInput[];
	shipping_lines?: ShippingLineInput[];
	coupon_lines?: CouponLineInput[];
}): CartSnapshot {
	return {
		line_items: parts.line_items,
		fee_lines: parts.fee_lines ?? [],
		shipping_lines: parts.shipping_lines ?? [],
		coupon_lines: parts.coupon_lines ?? [],
	};
}

// ===== rate fixtures (present in BOTH config.rates and config.allRates) =====

const exclusive20: TaxRateInput[] = [
	{ id: 1, name: 'VAT', rate: '20', compound: false, order: 1, class: 'standard', shipping: true },
];

const inclusive10: TaxRateInput[] = [
	{ id: 4, name: 'Tax', rate: '10', compound: false, order: 1, class: 'standard', shipping: true },
];

const compoundInclusive: TaxRateInput[] = [
	{ id: 1, name: 'GST', rate: '20', compound: false, order: 1, class: 'standard', shipping: true },
	{ id: 2, name: 'Levy', rate: '5', compound: true, order: 2, class: 'standard', shipping: true },
];

const exclusive10: TaxRateInput[] = [
	{ id: 7, name: 'CT', rate: '10', compound: false, order: 1, class: 'standard', shipping: true },
];

// ===== scenario matrix =====

describe('settleCart reproduces the legacy multi-patch loop in one pass', () => {
	it('1. no coupons / fixed fee / exclusive 20% tax', () => {
		const config = makeConfig(exclusive20);
		const lineItems = [
			buildLineItem({ product_id: 11, quantity: 2, price: 25 }, config),
			buildLineItem({ product_id: 12, quantity: 1, price: 9.99 }, config),
		];
		// DELIBERATE fixture choice: the fixed fee is persisted by the mutation-time
		// calculator. The legacy loop never recomputes non-percent fees, so the
		// snapshot starts (and stays) converged on both sides.
		const feeLines = [
			buildFixedFee({ name: 'Service', amount: 5, prices_include_tax: false }, lineItems, config),
		];
		const snapshot = makeSnapshot({ line_items: lineItems, fee_lines: feeLines });

		const oracle = expectSettleMatchesLegacy(snapshot, config);
		expect(oracle.passes).toBe(0); // nothing for the loop to do
	});

	it('2. no coupons / 10% percent fee (ex-tax basis) / inclusive tax', () => {
		const config = makeConfig(inclusive10, { pricesIncludeTax: true });
		const lineItems = [
			buildLineItem({ product_id: 21, quantity: 1, price: 33 }, config),
			buildLineItem({ product_id: 22, quantity: 3, price: 7.5 }, config),
		];
		// DELIBERATE fixture choice (no-coupon caveat): the fee is pre-computed by
		// calculateCartLine against these exact line items, so both sides start
		// converged — the oracle's recompute is a fixed point (passes: 0) and
		// settle's recompute emits an identical fee_lines patch.
		const feeLines = [
			buildPercentFee(
				{
					name: '10% surcharge',
					percent: 10,
					prices_include_tax: true,
					percent_of_cart_total_with_tax: false,
				},
				lineItems,
				config
			),
		];
		const snapshot = makeSnapshot({ line_items: lineItems, fee_lines: feeLines });

		const oracle = expectSettleMatchesLegacy(snapshot, config);
		expect(oracle.passes).toBe(0);
	});

	it('3. 50% coupon + 10% percent fee / exclusive tax — the second-pass fee case', () => {
		const config = makeConfig(exclusive20);
		const lineItems = [
			buildLineItem({ product_id: 31, quantity: 2, price: 30 }, config),
			buildLineItem({ product_id: 32, quantity: 1, price: 19.99 }, config),
		];
		// Fee persisted against the PRE-discount lines: exactly what is on disk
		// the moment a coupon is added. The legacy loop needs a second pass to
		// move it onto the discounted basis.
		const feeLines = [
			buildPercentFee(
				{
					name: '10% fee',
					percent: 10,
					prices_include_tax: false,
					percent_of_cart_total_with_tax: false,
				},
				lineItems,
				config
			),
		];
		const snapshot = makeSnapshot({
			line_items: lineItems,
			fee_lines: feeLines,
			coupon_lines: [freshCouponLine('save50')],
		});
		const ctx = makeCouponContext([{ code: 'save50', discount_type: 'percent', amount: '50' }]);

		const oracle = expectSettleMatchesLegacy(snapshot, config, ctx);
		// The legacy loop could NOT settle this in one pass: pass 1 discounts the
		// lines, pass 2 re-bases the percent fee — and settle matched it in ONE call.
		expect(oracle.passes).toBeGreaterThan(1);
		expect(oracle.feeLines).not.toEqual(feeLines); // the fee really moved
	});

	it('4. stacked coupons (10% + fixed_cart 5) / inclusive compound rates (20% + 5%)', () => {
		const config = makeConfig(compoundInclusive, { pricesIncludeTax: true });
		const lineItems = [
			buildLineItem({ product_id: 41, quantity: 1, price: 126 }, config),
			buildLineItem({ product_id: 42, quantity: 2, price: 31.5 }, config),
		];
		const snapshot = makeSnapshot({
			line_items: lineItems,
			coupon_lines: [freshCouponLine('tenoff'), freshCouponLine('fivecart')],
		});
		const ctx = makeCouponContext([
			{ code: 'tenoff', discount_type: 'percent', amount: '10' },
			{ code: 'fivecart', discount_type: 'fixed_cart', amount: '5' },
		]);

		const oracle = expectSettleMatchesLegacy(snapshot, config, ctx);
		expect(oracle.passes).toBe(1); // replay alone converges in one pass
	});

	it('5. dp=0 (JPY-style) with a 25% coupon', () => {
		const config = makeConfig(exclusive10, { dp: 0 });
		const lineItems = [
			buildLineItem({ product_id: 51, quantity: 1, price: 1980 }, config),
			buildLineItem({ product_id: 52, quantity: 3, price: 333 }, config),
		];
		const snapshot = makeSnapshot({
			line_items: lineItems,
			coupon_lines: [freshCouponLine('quarter')],
		});
		const ctx = makeCouponContext([{ code: 'quarter', discount_type: 'percent', amount: '25' }]);

		const oracle = expectSettleMatchesLegacy(snapshot, config, ctx);
		expect(oracle.passes).toBe(1);
	});

	it('6. taxRoundAtSubtotal=true with 15% coupon + 10% percent fee', () => {
		const config = makeConfig(exclusive20, { taxRoundAtSubtotal: true });
		const lineItems = [
			buildLineItem({ product_id: 61, quantity: 3, price: 9.99 }, config),
			buildLineItem({ product_id: 62, quantity: 1, price: 45.5 }, config),
		];
		const feeLines = [
			buildPercentFee(
				{
					name: '10% fee',
					percent: 10,
					prices_include_tax: false,
					percent_of_cart_total_with_tax: true,
				},
				lineItems,
				config
			),
		];
		const snapshot = makeSnapshot({
			line_items: lineItems,
			fee_lines: feeLines,
			coupon_lines: [freshCouponLine('fifteen')],
		});
		const ctx = makeCouponContext([{ code: 'fifteen', discount_type: 'percent', amount: '15' }]);

		const oracle = expectSettleMatchesLegacy(snapshot, config, ctx);
		expect(oracle.passes).toBeGreaterThan(1); // fee re-based after the discount
	});

	it('7. tombstones in all four arrays alongside active entries + an active coupon', () => {
		const config = makeConfig(exclusive20);
		const activeItem = buildLineItem({ product_id: 71, quantity: 2, price: 40 }, config);
		const tombstoneItem: LineItemInput = {
			product_id: null,
			quantity: 1,
			total: '15',
			total_tax: '3',
			subtotal: '15',
			subtotal_tax: '3',
			tax_class: '',
			taxes: [{ id: 1, subtotal: '3', total: '3' }],
			meta_data: [],
		};
		const lineItems = [activeItem, tombstoneItem];

		const activeFee = buildFixedFee(
			{ name: 'Handling', amount: 4, prices_include_tax: false },
			lineItems,
			config
		);
		const tombstoneFee: FeeLineInput = {
			name: null,
			total: '2',
			total_tax: '0.4',
			taxes: [],
			meta_data: [],
		};

		const activeShipping = buildShippingLine(
			{ method_id: 'flat_rate', method_title: 'Flat rate', amount: 10 },
			config
		);
		const tombstoneShipping: ShippingLineInput = {
			method_id: null,
			method_title: 'Old shipping',
			total: '5',
			total_tax: '1',
			taxes: [],
			meta_data: [],
		};

		const tombstoneCoupon: CouponLineInput = {
			code: null,
			discount: '2.5',
			discount_tax: '0.5',
			meta_data: [],
		};

		const snapshot = makeSnapshot({
			line_items: lineItems,
			fee_lines: [activeFee, tombstoneFee],
			shipping_lines: [activeShipping, tombstoneShipping],
			coupon_lines: [tombstoneCoupon, freshCouponLine('tendollars')],
		});
		const ctx = makeCouponContext([
			{ code: 'tendollars', discount_type: 'fixed_cart', amount: '10' },
		]);

		const oracle = expectSettleMatchesLegacy(snapshot, config, ctx);
		expect(oracle.passes).toBe(1);

		// Tombstones survive verbatim through both pipelines.
		expect(oracle.feeLines[1]).toEqual(tombstoneFee);
		expect(oracle.couponLines[0]).toEqual(tombstoneCoupon);
	});
});
