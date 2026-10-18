import { calculateCartLine } from './cart-line';
import { recalculateCoupons } from './internal/coupons/recalculate';
import { couponValidationContext, resolveCouponReplay } from './internal/coupons/context';
import { validateCoupon } from './internal/coupons/validate';
import { calculateOrderTotals, type OrderTotals } from './internal/order-totals';
import { extractFeeLineData } from './internal/lines/pos-data';
import {
	isActiveCouponLine,
	isActiveFeeLine,
	isActiveLineItem,
	isActiveShippingLine,
} from './snapshot';

import type { CartConfig } from './config';
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
	shipping_lines?: ShippingLineInput[]; // present IFF >=1 active shipping line actually CHANGED
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

/** Persisted totals compare finite numeric strings by value, otherwise by identity. */
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
 * The money slots of an order document and its lines: the persisted totals, the line-level
 * amounts (`taxes[]` included) and the coupon/fee slots. `meta_data` is opaque to this walk —
 * `_woocommerce_pos_data` carries `price`/`regular_price` strings whose formatting IS data.
 */
const MONEY_KEYS: ReadonlySet<string> = new Set([
	...PERSISTED_TOTAL_FIELDS,
	'subtotal',
	'subtotal_tax',
	'price',
	'discount',
	'amount',
	'tax_total',
	'shipping_tax_total',
]);

/** Clone comparison values only; never rewrite the emitted patch or the snapshot. */
function canonicalMoney(value: unknown, key = 'total'): unknown {
	if (key === 'meta_data') return value;
	if (Array.isArray(value)) return value.map((entry) => canonicalMoney(entry, key));
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([field, entry]) => [field, canonicalMoney(entry, field)])
		);
	}
	return MONEY_KEYS.has(key) &&
		(typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
		Number.isFinite(Number(value))
		? String(Number(value))
		: value;
}

/**
 * Missing totals are changes; finite numeric money compares by value, including in line arrays.
 * Server acks use six decimals while the client writes shortest-repr: a reformat is not a
 * cart change. Reporting one enqueues a held row that deadlocks adoption of a paid order.
 */
function computeChanged(snapshot: CartSnapshot, patch: SettlePatch): boolean {
	for (const field of PERSISTED_TOTAL_FIELDS) {
		if (
			snapshot[field] === undefined ||
			canonicalMoney(snapshot[field]) !== canonicalMoney(patch[field])
		)
			return true;
	}
	for (const field of [
		'line_items',
		'coupon_lines',
		'fee_lines',
		'shipping_lines',
		'tax_lines',
	] as const) {
		if (
			patch[field] &&
			JSON.stringify(canonicalMoney(snapshot[field] ?? [])) !==
				JSON.stringify(canonicalMoney(patch[field]))
		)
			return true;
	}
	return false;
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

	// 5b. Every active shipping line is recomputed on the same basis, for the same reason
	// percent fees are: its tax is a function of the cart and of the store's shipping tax
	// class, so a line added before either settled would keep a stale rate.
	//
	// This used to skip any line whose own tax class was not 'inherit' — "the merchant
	// chose it". That premise was false: WooCommerce has no per-line shipping tax class
	// (see `extractShippingLineData`), so the class now always comes from the store and
	// there is no per-line choice left to respect. The recompute is idempotent for a line
	// already on the store's class; the JSON compare below keeps it from writing.
	let shippingRecomputed = false;
	const postShippingLines = shippingLines.map((shipping) => {
		if (!isActiveShippingLine(shipping)) return shipping;
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
			shippingRecomputed = true;
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
	if (shippingRecomputed) {
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
	const coupons = options?.coupons ?? { coupons: new Map(), productCategories: new Map() };
	// Configs are built for the active codes only; candidates are validated, not replayed.
	const replayContext = resolveCouponReplay(coupons, activeCodes, neededCodes);
	if (!replayContext.ok) {
		return {
			ok: false,
			error: { code: 'missing_coupon', missingCodes: replayContext.missingCodes },
			warnings,
		};
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
		const context = {
			...couponValidationContext({
				lineItems: activeLineItems,
				appliedCouponLines,
				coupons,
				productCategories: replayContext.productCategories,
				billing: snapshot.billing,
				customer_id: snapshot.customer_id,
			}),
			now: options.validate.now,
		};

		for (let i = 0; i < candidateCodes.length; i++) {
			const code = candidateCodes[i];
			const coupon = coupons.coupons.get(code)!;
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
		const replay = recalculateCoupons({
			lineItems,
			couponLines,
			couponConfigs: replayContext.couponConfigs,
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
			productCategories: replayContext.productCategories,
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

/** Read a settlement result without exposing a mutator-named member at the UI seam. */
export function settlementPatch(
	result: SettleAggregateResult | Extract<SettleResult, { ok: true }>
) {
	return result.patch;
}
