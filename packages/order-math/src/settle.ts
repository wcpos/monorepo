import { isGuestCustomer } from '@wcpos/sync-core';

import { calculateCartLine } from './cart-line';
import { recalculateCoupons } from './internal/coupons/recalculate';
import { toCouponConfigs } from './internal/coupons/to-coupon-configs';
import { validateCoupon } from './internal/coupons/validate';
import { enrichCategoriesWithAncestors } from './internal/coupons/helpers';
import { calculateOrderTotals } from './internal/order-totals';
import {
	extractFeeLineData,
	extractShippingLineData,
	parsePosData,
} from './internal/lines/pos-data';
import { INHERIT_TAX_CLASS } from './internal/tax-class';
import {
	isActiveCouponLine,
	isActiveFeeLine,
	isActiveLineItem,
	isActiveShippingLine,
} from './snapshot';

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
	ShippingLineInput,
} from './types';

// DB element type — used only for the cast at the pos-data helper boundary.
// (The structural Input types are supertypes of these; see types.assignability.test.ts.)
type DbFeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
type DbShippingLine = NonNullable<
	import('@wcpos/database').OrderDocument['shipping_lines']
>[number];

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
	fee_lines?: FeeLineInput[]; // present IFF >=1 active percent fee actually CHANGED
	shipping_lines?: ShippingLineInput[]; // present IFF >=1 inheriting shipping line actually CHANGED
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
	if (
		patch.shipping_lines &&
		JSON.stringify(snapshot.shipping_lines ?? []) !== JSON.stringify(patch.shipping_lines)
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
		// QUIRK(parity): mirrors use-add-coupon.ts — `|| ''` preserved verbatim, and the
		// guest customer (and absent customer_id) maps to null for the email-based used_by check.
		customerEmail: snapshot.billing?.email || '',
		customerId:
			snapshot.customer_id == null || isGuestCustomer(snapshot.customer_id)
				? null
				: snapshot.customer_id,
		now,
	};
}

/**
 * Steps 5-7 of the pipeline, over whatever lines the caller settled on: percent
 * fees recomputed on that basis → order totals → the money patch.
 *
 * Shared by both entry points, which differ only in whether the coupon replay
 * ran before it. Everything here is a pure function of the lines it is handed,
 * needs no coupon data, and cannot fail — which is what lets `settleAggregate`
 * exist at all.
 *
 * `warnings` is appended to in place; the caller owns the array.
 */
function settleOverLines(args: {
	config: CartConfig;
	lineItems: LineItemInput[];
	feeLines: FeeLineInput[];
	shippingLines: ShippingLineInput[];
	couponLines: CouponLineInput[];
	warnings: EngineWarning[];
}): { patch: SettlePatch; totals: OrderTotals } {
	const { config, lineItems, shippingLines, couponLines, warnings } = args;

	// 5. Percent fees recomputed on the given line basis; fixed fees and
	// tombstones pass through untouched.
	let percentFeeRecomputed = false;
	const postFeeLines = args.feeLines.map((fee) => {
		if (!isActiveFeeLine(fee)) return fee;
		const { percent } = extractFeeLineData(fee as DbFeeLine, config.pricesIncludeTax);
		if (!percent) return fee;
		const result = calculateCartLine({ kind: 'fee', line: fee, cartLineItems: lineItems }, config);
		warnings.push(...result.warnings);
		// Same rule as the shipping pass below: recomputed is not changed, and an
		// unchanged array must not ride along in an asynchronous whole-field write.
		if (JSON.stringify(result.line) !== JSON.stringify(fee)) {
			percentFeeRecomputed = true;
		}
		return result.line;
	});

	// 5b. Shipping lines that inherit their tax class are recomputed on the same basis,
	// for the same reason percent fees are: their value is a function of the cart, so a
	// line added before the cart's tax classes settled would keep a stale rate. A line
	// with its own tax class is never touched — the merchant chose it.
	let inheritingShippingRecomputed = false;
	const postShippingLines = shippingLines.map((shipping) => {
		if (!isActiveShippingLine(shipping)) return shipping;
		const { tax_class } = extractShippingLineData(
			shipping as DbShippingLine,
			config.pricesIncludeTax,
			config.shippingTaxClass
		);
		if (tax_class !== INHERIT_TAX_CLASS) return shipping;
		const result = calculateCartLine(
			{ kind: 'shipping', line: shipping, cartLineItems: lineItems },
			config
		);
		warnings.push(...result.warnings);
		// Recomputing is not the same as changing. The patch is applied as an
		// asynchronous whole-field write, so attaching an array that recomputed to
		// identical values turns a money-only settle into another line write — one that
		// can land on top of a shipping edit the cashier made in the meantime.
		if (JSON.stringify(result.line) !== JSON.stringify(shipping)) {
			inheritingShippingRecomputed = true;
		}
		return result.line;
	});

	// 6. Order totals over (lines, post-fee fees, shipping, coupons). Full arrays
	// incl. tombstones — calculateOrderTotals filters internally. config.allRates
	// seeds the tax_lines labels.
	const totals = calculateOrderTotals(
		{
			lineItems,
			feeLines: postFeeLines,
			shippingLines: postShippingLines,
			couponLines,
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
	if (percentFeeRecomputed) {
		patch.fee_lines = postFeeLines;
	}
	if (inheritingShippingRecomputed) {
		patch.shipping_lines = postShippingLines;
	}

	return { patch, totals };
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
		const candidateCounts = new Map<string, number>();
		for (const code of candidateCodes) {
			candidateCounts.set(code, (candidateCounts.get(code) ?? 0) + 1);
		}
		const appliedCouponLines = [...activeCouponLines]
			.reverse()
			.filter((cl) => {
				const code = cl.code.toLowerCase();
				const count = candidateCounts.get(code) ?? 0;
				if (count === 0) {
					return true;
				}
				candidateCounts.set(code, count - 1);
				return false;
			})
			.reverse();
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
			const code = candidateCodes[i];
			const coupon = availableCoupons!.get(code)!;
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
			context.appliedCoupons.push(code);
			if (coupon.individual_use) {
				context.appliedCouponsWithIndividualUse.push(code);
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

	// 5-7. Percent fees on the post-replay basis → order totals → patch.
	const { patch, totals } = settleOverLines({
		config,
		lineItems: postReplayLineItems ?? lineItems,
		feeLines,
		shippingLines,
		couponLines: postReplayCouponLines ?? couponLines,
		warnings,
	});

	// The replay's own output. Present IFF stage 4 ran — zero active coupons
	// leaves line_items and coupon_lines out of the patch entirely.
	if (postReplayLineItems && postReplayCouponLines) {
		patch.line_items = postReplayLineItems;
		patch.coupon_lines = postReplayCouponLines;
	}

	return { ok: true, changed: computeChanged(snapshot, patch), patch, totals, warnings };
}

// ===== entry point 2: settleAggregate =====

/**
 * What `settleAggregate` may write: the money, percent fees, and shipping lines whose
 * tax class inherits from the cart. Never the line items.
 */
export type SettleAggregatePatch = Omit<SettlePatch, 'line_items' | 'coupon_lines'>;

export interface SettleAggregateResult {
	changed: boolean;
	patch: SettleAggregatePatch;
	totals: OrderTotals;
	warnings: readonly EngineWarning[];
}

/**
 * Settle the order's MONEY over the lines exactly as they are persisted.
 *
 * The aggregate is a pure function of the lines already on the order, so unlike
 * `settleCart` this needs no `CouponContext` and has no failure mode. That is
 * the entire point of it existing separately. `settleCart` gates on having every
 * active coupon in hand, and fetching those is asynchronous — routing the money
 * write through it left a couponed cart's `discount_total` unpersisted while the
 * cashier saved (#1472), because the write sat behind a reference prefetch that
 * only the coupon replay ever needed.
 *
 * Coupon discounts are NOT re-derived here. They are already distributed across
 * `line_items[].total` by whoever applied the coupon, and this reads that
 * distribution as given. Redistributing it after a cart edit is `settleCart`'s
 * job; its output arrives as new lines, which bring this pass round again.
 *
 * With zero active coupon lines the two entry points are the same calculation —
 * `settleCart` skips its replay and runs exactly these steps. Pinned in
 * settle.test.ts.
 */
export function settleAggregate(snapshot: CartSnapshot, config: CartConfig): SettleAggregateResult {
	const warnings: EngineWarning[] = [];

	const { patch, totals } = settleOverLines({
		config,
		lineItems: [...(snapshot.line_items ?? [])],
		feeLines: [...(snapshot.fee_lines ?? [])],
		shippingLines: [...(snapshot.shipping_lines ?? [])],
		couponLines: [...(snapshot.coupon_lines ?? [])],
		warnings,
	});

	return { changed: computeChanged(snapshot, patch), patch, totals, warnings };
}
