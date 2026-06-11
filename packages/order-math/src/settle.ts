import { calculateCartLine } from './cart-line';
import { recalculateCoupons } from './internal/coupons/recalculate';
import { toCouponConfigs } from './internal/coupons/to-coupon-configs';
import { validateCoupon } from './internal/coupons/validate';
import { enrichCategoriesWithAncestors } from './internal/coupons/helpers';
import { calculateOrderTotals } from './internal/order-totals';
import { extractFeeLineData, parsePosData } from './internal/lines/pos-data';
import { isActiveCouponLine, isActiveFeeLine, isActiveLineItem } from './snapshot';

import type { CartConfig } from './config';
import type { CouponLineItem } from './internal/coupons/helpers';
import type { OrderTotals } from './order-totals';
import type { CartSnapshot } from './snapshot';
import type {
	CouponContext,
	CouponLineInput,
	CouponRejection,
	EngineWarning,
	FeeLineInput,
	LineItemInput,
	MoneyString,
} from './types';

// DB element type — used only for the cast at the pos-data helper boundary.
// (The structural Input types are supertypes of these; see types.assignability.test.ts.)
type DbFeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];

// ===== public types (SPEC §3) =====

export interface SettleOptions {
	/** Required iff snapshot has >=1 active coupon line OR validate is given. */
	coupons?: CouponContext;
	/** Validate these codes as newly-added candidates before replaying. */
	validate?: {
		codes: readonly string[];
		/** Epoch ms — the ONLY clock input in the package. */
		now: number;
	};
}

export interface TaxLineOutput {
	rate_id: number;
	label: string;
	compound: boolean;
	tax_total: MoneyString;
	shipping_tax_total: MoneyString;
	rate_percent: number;
	meta_data: unknown[];
}

export interface SettlePatch {
	line_items?: LineItemInput[]; // present IFF coupon replay ran
	coupon_lines?: CouponLineInput[]; // present IFF coupon replay ran
	fee_lines?: FeeLineInput[]; // present IFF >=1 active percent fee recomputed
	discount_total: MoneyString;
	discount_tax: MoneyString;
	shipping_total: MoneyString;
	shipping_tax: MoneyString;
	cart_tax: MoneyString;
	total_tax: MoneyString;
	total: MoneyString;
	tax_lines: TaxLineOutput[];
}

export type SettleError =
	| { code: 'missing_coupon'; missingCodes: readonly string[] }
	| { code: 'invalid_coupon'; couponCode: string; rejection: CouponRejection };

export type SettleResult =
	| {
			ok: true;
			changed: boolean;
			patch: SettlePatch;
			totals: OrderTotals;
			warnings: readonly EngineWarning[];
	  }
	| { ok: false; error: SettleError; warnings: readonly EngineWarning[] };

// ===== internals =====

/** Persisted money fields compared string-for-string for `changed` detection. */
const PERSISTED_TOTAL_FIELDS = [
	'discount_total',
	'discount_tax',
	'shipping_total',
	'shipping_tax',
	'cart_tax',
	'total_tax',
	'total',
] as const;

/**
 * `changed` = inequality of the patch's persisted fields against the snapshot's
 * persisted fields. A snapshot missing any persisted total ⇒ `true`. Array
 * fields are compared by JSON only when present in the patch.
 */
function computeChanged(snapshot: CartSnapshot, patch: SettlePatch): boolean {
	for (const field of PERSISTED_TOTAL_FIELDS) {
		const previous = snapshot[field];
		if (previous === undefined || previous !== patch[field]) {
			return true;
		}
	}
	if (JSON.stringify(snapshot.tax_lines ?? []) !== JSON.stringify(patch.tax_lines)) {
		return true;
	}
	if (
		patch.line_items &&
		JSON.stringify(snapshot.line_items ?? []) !== JSON.stringify(patch.line_items)
	) {
		return true;
	}
	if (
		patch.coupon_lines &&
		JSON.stringify(snapshot.coupon_lines ?? []) !== JSON.stringify(patch.coupon_lines)
	) {
		return true;
	}
	if (
		patch.fee_lines &&
		JSON.stringify(snapshot.fee_lines ?? []) !== JSON.stringify(patch.fee_lines)
	) {
		return true;
	}
	return false;
}

/**
 * Build the candidate-validation context EXACTLY as `use-add-coupon.ts` builds
 * it today: item price = parseFloat(total)/quantity, on_sale from
 * `_woocommerce_pos_data` price < regular_price, cartSubtotal = Σ
 * parseFloat(subtotal) over active lines, customer identity from the snapshot.
 */
function buildValidationContext(args: {
	snapshot: CartSnapshot;
	activeLineItems: readonly LineItemInput[];
	appliedCouponLines: readonly (CouponLineInput & { code: string })[];
	coupons: CouponContext['coupons'];
	enrichedCategories: Map<number, { id: number }[]>;
	now: number;
}) {
	const { snapshot, activeLineItems, appliedCouponLines, coupons, enrichedCategories, now } = args;

	const lineItems: CouponLineItem[] = activeLineItems.map((item) => {
		const qty = item.quantity || 1;
		const posData = parsePosData(item);
		const posPrice = posData?.price != null ? parseFloat(String(posData.price)) : NaN;
		const posRegular =
			posData?.regular_price != null ? parseFloat(String(posData.regular_price)) : NaN;
		const onSale =
			Number.isFinite(posPrice) && Number.isFinite(posRegular) && posRegular > 0
				? posPrice < posRegular
				: false;
		return {
			product_id: item.product_id!,
			quantity: qty,
			price: parseFloat(item.total || '0') / qty,
			subtotal: item.subtotal || '0',
			total: item.total || '0',
			categories: enrichedCategories.get(item.product_id!) || [],
			on_sale: onSale,
		};
	});

	const cartSubtotal = activeLineItems.reduce(
		(sum, item) => sum + parseFloat(item.subtotal || '0'),
		0
	);

	const appliedCoupons = appliedCouponLines.map((cl) => cl.code);
	const appliedCouponsWithIndividualUse: string[] = [];
	for (const cl of appliedCouponLines) {
		const applied = coupons.get(cl.code.toLowerCase());
		if (applied?.individual_use && cl.code) {
			appliedCouponsWithIndividualUse.push(cl.code);
		}
	}

	return {
		lineItems,
		appliedCoupons,
		appliedCouponsWithIndividualUse,
		cartSubtotal,
		// QUIRK(parity): `|| ''` / `|| null` preserved verbatim from use-add-coupon.ts
		// (customer_id 0 coerces to null, matching today's guest handling).
		customerEmail: snapshot.billing?.email || '',
		customerId: snapshot.customer_id || null,
		now,
	};
}

// ===== entry point 1: settleCart =====

/**
 * The one-pass settle pipeline (SPEC §4): missing-coupon gate → candidate
 * validation → coupon replay → percent fees on the post-replay basis → order
 * totals → one atomic patch. Pure, sync, deterministic; inputs never mutated;
 * `date_modified_gmt` never appears in any output.
 */
export function settleCart(
	snapshot: CartSnapshot,
	config: CartConfig,
	options?: SettleOptions
): SettleResult {
	const warnings: EngineWarning[] = [];

	const lineItems = [...(snapshot.line_items ?? [])];
	const feeLines = [...(snapshot.fee_lines ?? [])];
	const shippingLines = [...(snapshot.shipping_lines ?? [])];
	const couponLines = [...(snapshot.coupon_lines ?? [])];

	const activeCouponLines = couponLines.filter((cl): cl is CouponLineInput & { code: string } =>
		isActiveCouponLine(cl)
	);
	const activeCodes = activeCouponLines.map((cl) => cl.code.toLowerCase());
	const candidateCodes = (options?.validate?.codes ?? []).map((code) => code.toLowerCase().trim());

	// 1. missing_coupon gate — every active code and every candidate must have a
	// CouponInput in the context. No partial output. (Sanctioned crash fix (a):
	// today this throws inside an uncaught subscription.)
	const neededCodes = [...new Set([...activeCodes, ...candidateCodes])];
	const availableCoupons = options?.coupons?.coupons;
	const missingCodes = neededCodes.filter((code) => !availableCoupons?.has(code));
	if (missingCodes.length > 0) {
		return { ok: false, error: { code: 'missing_coupon', missingCodes }, warnings };
	}

	// 2. Category enrichment — once, shared by validation and replay
	// (wc_get_product_cat_ids parity: ancestors included).
	const enrichedCategories = new Map<number, { id: number }[]>();
	if (options?.coupons) {
		const direct = new Map<number, { id: number }[]>();
		for (const [productId, categories] of options.coupons.productCategories) {
			direct.set(productId, [...categories]);
		}
		const enriched = enrichCategoriesWithAncestors(
			direct,
			new Map(options.coupons.categoryParents ?? [])
		);
		for (const [productId, categories] of enriched) {
			enrichedCategories.set(productId, categories);
		}
	}

	// 3. Validation stage — each candidate validated, in order, against the cart
	// minus candidates. First failure short-circuits.
	if (options?.validate && candidateCodes.length > 0) {
		const candidateSet = new Set(candidateCodes);
		const appliedCouponLines = activeCouponLines.filter(
			(cl) => !candidateSet.has(cl.code.toLowerCase())
		);
		const activeLineItems = lineItems.filter((item) => isActiveLineItem(item));
		const context = buildValidationContext({
			snapshot,
			activeLineItems,
			appliedCouponLines,
			coupons: availableCoupons!,
			enrichedCategories,
			now: options.validate.now,
		});

		for (let i = 0; i < candidateCodes.length; i++) {
			const coupon = availableCoupons!.get(candidateCodes[i])!;
			const result = validateCoupon(coupon, context);
			if (!result.valid) {
				return {
					ok: false,
					error: {
						code: 'invalid_coupon',
						couponCode: options.validate.codes[i],
						rejection: result.rejection,
					},
					warnings,
				};
			}
		}
	}

	// 4. Coupon replay — iff >=1 active coupon line. Zero active coupons ⇒
	// line_items NEVER touched and the keys stay out of the patch (frozen regime).
	let postReplayLineItems: LineItemInput[] | undefined;
	let postReplayCouponLines: CouponLineInput[] | undefined;
	if (activeCouponLines.length > 0) {
		const couponConfigs = toCouponConfigs(activeCodes, availableCoupons!);

		const replay = recalculateCoupons({
			lineItems,
			couponLines,
			couponConfigs,
			pricesIncludeTax: config.pricesIncludeTax,
			calcDiscountsSequentially: config.calcDiscountsSequentially,
			// QUIRK(parity): replay taxes are recomputed from config.rates UNGATED by
			// calcTaxes (SPEC §8.4) — pinned by the migrated recalculate tests.
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
		postReplayLineItems = replay.lineItems;
		postReplayCouponLines = replay.couponLines;
	}

	// 5. Percent fees recomputed on the POST-replay active line items; fixed fees
	// and tombstones pass through untouched.
	const feeBasisLineItems = postReplayLineItems ?? lineItems;
	let percentFeeRecomputed = false;
	const postFeeLines = feeLines.map((fee) => {
		if (!isActiveFeeLine(fee)) return fee;
		const { percent } = extractFeeLineData(fee as DbFeeLine, config.pricesIncludeTax);
		if (!percent) return fee;
		percentFeeRecomputed = true;
		const result = calculateCartLine(
			{ kind: 'fee', line: fee, cartLineItems: feeBasisLineItems },
			config
		);
		warnings.push(...result.warnings);
		return result.line;
	});

	// 6. Order totals over (post-replay lines, post-fee fees, snapshot shipping,
	// post-replay coupons). Full arrays incl. tombstones — calculateOrderTotals
	// filters internally. config.allRates seeds the tax_lines labels.
	const totals = calculateOrderTotals(
		{
			lineItems: feeBasisLineItems,
			feeLines: postFeeLines,
			shippingLines,
			couponLines: postReplayCouponLines ?? couponLines,
			taxRates: [...config.allRates],
			taxRoundAtSubtotal: config.taxRoundAtSubtotal,
			dp: config.dp,
			pricesIncludeTax: config.pricesIncludeTax,
		},
		(warning) => warnings.push(warning)
	);

	// 7. Patch assembly — array keys present only when their stage ran.
	const patch: SettlePatch = {
		discount_total: totals.discount_total,
		discount_tax: totals.discount_tax,
		shipping_total: totals.shipping_total,
		shipping_tax: totals.shipping_tax,
		cart_tax: totals.cart_tax,
		total_tax: totals.total_tax,
		total: totals.total,
		tax_lines: totals.tax_lines,
	};
	if (postReplayLineItems && postReplayCouponLines) {
		patch.line_items = postReplayLineItems;
		patch.coupon_lines = postReplayCouponLines;
	}
	if (percentFeeRecomputed) {
		patch.fee_lines = postFeeLines;
	}

	return { ok: true, changed: computeChanged(snapshot, patch), patch, totals, warnings };
}
