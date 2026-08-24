import find from 'lodash/find';
import uniq from 'lodash/uniq';

import { POS_META_KEYS } from '@wcpos/sync-core';

import { calculateTaxesForValue } from './internal/lines/calc-taxes-for-value';
import {
	extractFeeLineData,
	extractLineItemData,
	extractShippingLineData,
	getMetaDataValueByKey,
	parsePosData,
	updatePosDataMeta,
} from './internal/lines/pos-data';
import { getRoundingPrecision, roundHalfUp, roundTaxTotal } from './internal/money/precision';
import { isActiveFeeLine, isActiveLineItem, isActiveShippingLine } from './snapshot';

import type { CartConfig } from './config';
import type { CartLine } from './internal/lines/pos-data';
import type {
	EngineWarning,
	FeeLineInput,
	LineItemInput,
	ShippingLineInput,
	WarningSite,
} from './types';

/**
 * PER_RATE_TAXES_ARE_UNROUNDED — the WooCommerce contract for a line's `taxes[]` array.
 *
 * WooCommerce stores the per-rate tax array UNROUNDED, at its configured rounding precision,
 * and
 * applies `wc_round_tax_total` only when summing those values into `total_tax`. All three
 * order-item classes are identical on this point — `class-wc-order-item-fee.php:222-230`,
 * `-shipping.php:167-178`, `-product.php:214-231`:
 *
 *     $tax_data['total'] = array_map( 'wc_format_decimal', $total );   // <- NOT rounded
 *     $this->set_prop( 'taxes', $tax_data );
 *     if ( 'yes' === get_option( 'woocommerce_tax_round_at_subtotal' ) ) {
 *         $this->set_total_tax( array_sum( $tax_data['total'] ) );
 *     } else {
 *         $this->set_total_tax( array_sum( array_map( 'wc_round_tax_total', $tax_data['total'] ) ) );
 *     }
 *
 * `wc_format_decimal($n)` with `$dp === false` does not round — it renders the float at
 * `wc_get_rounding_precision()` (`max(dp + 2, 6)`). So `woocommerce_tax_round_at_subtotal` changes
 * `total_tax`/`subtotal_tax` and NOTHING ELSE.
 *
 * This package used to round `taxes[]` to `dp` as well whenever round-at-subtotal was off,
 * on the false premise that "WC per-item rounding" applied to the stored array. Every fee
 * and shipping fixture in cart-line.test.ts happened to use a 2dp-clean amount (10 @ 20%
 * = 2), so the whole suite passed under either rule. It surfaced only in production: a
 * 1.00 tax-inclusive fee at 10% on dev-free.wcpos.com (order 111919, 2026-08-24) sent
 * `taxes[6].total = 0.090000` against the server's `0.090909`, and the cashier got the
 * "your store changed this order's totals" banner on a correctly-rung sale.
 *
 * Any new fixture for line taxes MUST use an amount whose tax is not a whole cent.
 */

/**
 * A line's `total_tax` / `subtotal_tax`, derived from its STORED per-rate array.
 *
 * WooCommerce never sums the raw tax. `set_taxes()` first formats every per-rate value
 * to storage precision, and only then aggregates the FORMATTED array:
 *
 *     $tax_data['total'] = array_map( 'wc_format_decimal', $total );   // storage precision
 *     $this->set_prop( 'taxes', $tax_data );
 *     if ( 'yes' === get_option( 'woocommerce_tax_round_at_subtotal' ) ) {
 *         $this->set_total_tax( array_sum( $tax_data['total'] ) );
 *     } else {
 *         $this->set_total_tax( array_sum( array_map( 'wc_round_tax_total', $tax_data['total'] ) ) );
 *     }
 *
 * Both branches read `$tax_data['total']` — the stored array — so the rule is the same
 * either way: ROUND EACH RATE FIRST, THEN SUM. This package used to round the raw
 * multi-rate total instead, which is `round(a + b)` against WooCommerce's
 * `round(a) + round(b)`. On a single-rate store the two agree and nothing shows. On a
 * two-rate store they part company by a microunit whenever the raw sum sits on a
 * boundary — measured on dev-pro 2026-08-24, a fee whose rates give 0.089127 and
 * 0.019608: the till sent `total_tax` 0.108734 where the store stored 0.108735, and
 * every such sale raised the totals-changed banner.
 *
 * That microunit was previously read as an unavoidable PHP-float-vs-decimal tie and
 * written into `expectTaxParity` as a tolerance. It is not a tie. It is this.
 *
 * @param storedPerRate - Per-rate taxes ALREADY at configured storage precision.
 */
function sumStoredLineTax(
	storedPerRate: readonly number[],
	dp: number,
	pricesIncludeTax: boolean,
	taxRoundAtSubtotal: boolean
): number {
	const summands = taxRoundAtSubtotal
		? storedPerRate
		: storedPerRate.map((value) => roundTaxTotal(value, dp, pricesIncludeTax));
	const total = summands.reduce((sum, value) => sum + value, 0);
	// `wc_format_decimal( $amount )` with $dp === false renders at rounding precision.
	return roundHalfUp(total, getRoundingPrecision(dp));
}

// DB element types — used only for casts at the pos-data helper boundary.
// (The structural Input types are supertypes of these; see types.assignability.test.ts.)
type DbLineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type DbFeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
type DbShippingLine = NonNullable<
	import('@wcpos/database').OrderDocument['shipping_lines']
>[number];

type Tax = { id: number; total: number };

// ===== public types (SPEC §3) =====

/**
 * Extends `Partial<LineItemInput>` for the same passthrough reason the fee and shipping
 * shapes do — the line-item edit form submits the whole line, `meta_data` included.
 *
 * `name` and `sku` are declared explicitly because `LineItemInput` does not model them:
 * the engine never reads either, they only ride through the merge.
 */
export interface LineItemChanges extends Partial<LineItemInput> {
	quantity?: number;
	price?: number;
	regular_price?: number;
	tax_status?: 'taxable' | 'none';
	tax_class?: string;
	name?: string;
	sku?: string;
	/**
	 * Misc-product (product_id 0) pos_data fields. `convertProductToLineItem` writes them
	 * at creation and the edit form round-trips them, so a changes-merge that dropped them
	 * would silently strip a misc product's flags on every unrelated line edit. Written
	 * only when present — see `applyLineItemChanges`.
	 */
	virtual?: boolean;
	downloadable?: boolean;
	categories?: { id: number; name: string }[];
}

/**
 * Extends `Partial<FeeLineInput>` for the same reason `ShippingLineChanges` does: the fee
 * edit form submits the whole line, `meta_data` included, and the merge below spreads
 * everything it does not recognise straight through.
 */
export interface FeeLineChanges extends Partial<FeeLineInput> {
	/**
	 * A STRING from every caller in the app — the two fee cells and the edit form all send
	 * `String(amount)`, and `useAddFee` writes a string into pos_data. `extractFeeLineData`
	 * is what converts, on read. Typing this `number` alone would have made every real call
	 * site an error, so accept what the app actually sends.
	 */
	amount?: string | number;
	percent?: boolean;
	prices_include_tax?: boolean;
	percent_of_cart_total_with_tax?: boolean;
	tax_status?: 'taxable' | 'none';
	tax_class?: string;
}

/**
 * Extends `Partial<ShippingLineInput>` because the shipping edit form submits the WHOLE
 * line — `meta_data` and `instance_id` alongside the four posData fields — and the merge
 * below spreads everything it does not recognise straight through. Modelling only the
 * posData fields would leave the form's `meta_data` edit legal at runtime but invisible
 * to the type, which is how a passthrough field gets dropped by a later refactor.
 */
export interface ShippingLineChanges extends Partial<ShippingLineInput> {
	amount?: number;
	tax_status?: 'taxable' | 'none';
	tax_class?: string;
	prices_include_tax?: boolean;
	/** Woo's shipping-method instance id. Carried through untouched. */
	instance_id?: string;
}

export type CartLineInput =
	| { kind: 'line_item'; line: LineItemInput; changes?: LineItemChanges }
	| {
			kind: 'fee';
			line: FeeLineInput;
			changes?: FeeLineChanges;
			/** Percent basis — EXPLICIT input replacing the getLatest() mid-math read. */
			cartLineItems: readonly LineItemInput[];
	  }
	| { kind: 'shipping'; line: ShippingLineInput; changes?: ShippingLineChanges };

export interface CalcLineResult<T> {
	line: T;
	warnings: readonly EngineWarning[];
}

// ===== warnings =====

/**
 * Detect a `_woocommerce_pos_data` meta entry whose value cannot be used:
 * the key is present (non-empty value) but `parsePosData` yields null
 * (invalid legacy JSON, or a non-object typed value), so extract* silently fell back
 * to totals-derived defaults.
 */
function detectMalformedPosData(
	line: CartLine,
	lineType: WarningSite['lineType'],
	warnings: EngineWarning[]
): void {
	const posDataValue = getMetaDataValueByKey(line.meta_data, POS_META_KEYS.posData);
	if (posDataValue && parsePosData(line) == null) {
		warnings.push({ code: 'malformed_pos_data', where: { lineType, index: -1 } });
	}
}

// ===== changes merges (ports of the use-update-* hooks' merge blocks) =====

/**
 * THE changes-merge for line items — `useUpdateLineItem` calls this rather than carrying
 * its own copy (the block it was ported from is deleted):
 * `price`/`regular_price`/`tax_status` go into `_woocommerce_pos_data` with
 * `?? prev` fallbacks; everything else merges top-level.
 *
 * `virtual`/`downloadable`/`categories` are the misc-product pos_data fields, and they
 * follow the hook's rule exactly: written only when the caller supplied them. They take
 * NO `?? prev` fallback, because `extractLineItemData` does not surface them — an absent
 * key must leave whatever pos_data already holds untouched, and `updatePosDataMeta`
 * merges over the existing value, so omitting the key is what preserves it. Spreading
 * `virtual: undefined` instead would overwrite a real flag with undefined.
 */
function applyLineItemChanges(
	line: LineItemInput,
	changes: LineItemChanges,
	config: CartConfig
): LineItemInput {
	// get previous line data from meta_data
	const prevData = extractLineItemData(line as DbLineItem, config.pricesIncludeTax);

	// extract the meta_data from the changes
	const { price, regular_price, tax_status, virtual, downloadable, categories, ...rest } = changes;

	// merge the previous line data with the rest of the changes
	const updatedItem = { ...line, ...rest };

	return updatePosDataMeta(updatedItem as DbLineItem, {
		price: price ?? prevData.price,
		regular_price: regular_price ?? prevData.regular_price,
		tax_status: tax_status ?? prevData.tax_status,
		...(virtual !== undefined && { virtual }),
		...(downloadable !== undefined && { downloadable }),
		...(categories !== undefined && { categories }),
	});
}

/**
 * THE changes-merge for fee lines — `useUpdateFeeLine` calls this rather than carrying its
 * own copy (the block it was ported from is deleted):
 * `amount`/`percent`/`prices_include_tax`/`percent_of_cart_total_with_tax` go into
 * `_woocommerce_pos_data` with `?? prev` fallbacks; everything else (name,
 * tax_status, tax_class, ...) merges top-level.
 */
function applyFeeLineChanges(
	line: FeeLineInput,
	changes: FeeLineChanges,
	config: CartConfig
): FeeLineInput {
	// get previous line data from meta_data
	const prevData = extractFeeLineData(line as DbFeeLine, config.pricesIncludeTax);

	// extract the meta_data from the changes
	const { amount, percent, prices_include_tax, percent_of_cart_total_with_tax, ...rest } = changes;

	// merge the previous line data with the rest of the changes
	const updatedItem = { ...line, ...rest };

	return updatePosDataMeta(updatedItem as DbFeeLine, {
		amount: amount ?? prevData.amount,
		percent: percent ?? prevData.percent,
		prices_include_tax: prices_include_tax ?? prevData.prices_include_tax,
		percent_of_cart_total_with_tax:
			percent_of_cart_total_with_tax ?? prevData.percent_of_cart_total_with_tax,
	});
}

/**
 * THE changes-merge for shipping lines — `useUpdateShippingLine` calls this rather than
 * carrying its own copy (the block it was ported from is deleted):
 * `amount`/`prices_include_tax`/`tax_class`/`tax_status` go into
 * `_woocommerce_pos_data` with `?? prev` fallbacks; everything else
 * (method_title, method_id, ...) merges top-level.
 */
function applyShippingLineChanges(
	line: ShippingLineInput,
	changes: ShippingLineChanges,
	config: CartConfig
): ShippingLineInput {
	// get previous line data from meta_data
	const prevData = extractShippingLineData(
		line as DbShippingLine,
		config.pricesIncludeTax,
		config.shippingTaxClass
	);

	// extract the meta_data from the changes
	const { amount, prices_include_tax, tax_class, tax_status, ...rest } = changes;

	// merge the previous line data with the rest of the changes
	const updatedItem = { ...line, ...rest };

	return updatePosDataMeta(updatedItem as DbShippingLine, {
		amount: amount ?? prevData.amount,
		prices_include_tax: prices_include_tax ?? prevData.prices_include_tax,
		tax_class: tax_class ?? prevData.tax_class,
		tax_status: tax_status ?? prevData.tax_status,
	});
}

// ===== compute bodies (ports of the use-calculate-*-tax-and-totals hooks) =====

/**
 * Consolidates unique taxes by combining subtotal and total tax values.
 *
 * Per-rate taxes are ALWAYS emitted unrounded, at the configured rounding precision, whatever
 * `taxRoundAtSubtotal` says — see PER_RATE_TAXES_ARE_UNROUNDED. That setting governs
 * `total_tax`/`subtotal_tax` only, and those are rounded by the caller.
 *
 * Moved from use-calculate-line-item-tax-and-totals.ts, which is now deleted.
 */
const consolidateTaxes = (
	subtotalTaxes: { taxes: Tax[] },
	totalTaxes: { taxes: Tax[] },
	noSubtotal: boolean,
	roundingPrecision: number
) => {
	const uniqueTaxIds = uniq([
		...subtotalTaxes.taxes.map((tax) => tax.id),
		...totalTaxes.taxes.map((tax) => tax.id),
	]);

	return uniqueTaxIds.map((id) => {
		const subtotalTax = find(subtotalTaxes.taxes, { id }) || { total: 0 };
		const totalTax = find(totalTaxes.taxes, { id }) || { total: 0 };

		return {
			id,
			subtotal: noSubtotal
				? ''
				: roundHalfUp(subtotalTax.total, roundingPrecision).toFixed(roundingPrecision),
			total: roundHalfUp(totalTax.total, roundingPrecision).toFixed(roundingPrecision),
		};
	});
};

/**
 * The line-item tax maths. Began as a port of `calculateLineItemTaxesAndTotals`
 * (use-calculate-line-item-tax-and-totals.ts); that hook was deleted once its four call
 * sites came through here, so this is now the only copy — do not reintroduce a second one
 * in `packages/core`.
 */
function computeLineItem(lineItem: LineItemInput, config: CartConfig): LineItemInput {
	const { pricesIncludeTax, taxRoundAtSubtotal } = config;
	const { price, tax_status } = extractLineItemData(lineItem as DbLineItem, pricesIncludeTax);
	const quantity = lineItem.quantity ?? 0;
	const dp = config.dp;
	const roundingPrecision = getRoundingPrecision(dp);

	// Calculate total and subtotal based on quantity
	const total = price * quantity;
	const subtotal = price * quantity;

	// Calculate taxes for total and subtotal
	const totalTaxResult = calculateTaxesForValue(
		{
			amount: total,
			taxClass: lineItem.tax_class ?? '',
			taxStatus: tax_status,
			amountIncludesTax: pricesIncludeTax,
		},
		config
	);

	const subtotalTaxResult = calculateTaxesForValue(
		{
			amount: subtotal,
			taxClass: lineItem.tax_class ?? '',
			taxStatus: tax_status,
			amountIncludesTax: pricesIncludeTax,
		},
		config
	);

	const perUnitTaxResult = calculateTaxesForValue(
		{
			amount: price,
			taxClass: lineItem.tax_class ?? '',
			taxStatus: tax_status,
			amountIncludesTax: pricesIncludeTax,
		},
		config
	);

	// total_tax / subtotal_tax come from the STORED per-rate array, never from the raw
	// multi-rate sum — see sumStoredLineTax.
	const storedTotalTaxes = totalTaxResult.taxes.map((tax) =>
		roundHalfUp(tax.total, roundingPrecision)
	);
	const storedSubtotalTaxes = subtotalTaxResult.taxes.map((tax) =>
		roundHalfUp(tax.total, roundingPrecision)
	);
	const roundedTotalTax = sumStoredLineTax(
		storedTotalTaxes,
		dp,
		pricesIncludeTax,
		taxRoundAtSubtotal
	);
	const roundedSubtotalTax = sumStoredLineTax(
		storedSubtotalTaxes,
		dp,
		pricesIncludeTax,
		taxRoundAtSubtotal
	);

	// Calculate total and subtotal excluding tax
	const totalExclTax = pricesIncludeTax ? total - totalTaxResult.total : total;
	const subtotalExclTax = pricesIncludeTax ? subtotal - subtotalTaxResult.total : subtotal;

	// Calculate price per unit excluding tax
	const priceWithoutTax = pricesIncludeTax ? price - perUnitTaxResult.total : price;

	// Consolidate taxes
	const taxes = consolidateTaxes(subtotalTaxResult, totalTaxResult, false, roundingPrecision);

	// Line-level values (total, subtotal, price) are stored at configured rounding precision
	// to match WC's internal storage. WC stores these "unrounded" via wc_format_decimal()
	// and the POS API returns them at dp=6. Only order-level totals get rounded to dp.
	return {
		...lineItem,
		price: roundHalfUp(priceWithoutTax, roundingPrecision),
		total: String(roundHalfUp(totalExclTax, roundingPrecision)),
		subtotal: String(roundHalfUp(subtotalExclTax, roundingPrecision)),
		total_tax: String(roundedTotalTax),
		subtotal_tax: String(roundedSubtotalTax),
		taxes,
	};
}

/**
 * If fee is a fixed percent of the order total, calculate the amount.
 *
 * Port of `calculatePercentAmount` (use-calculate-fee-line-tax-and-totals.ts);
 * the hook's `currentOrder.getLatest().line_items` read becomes the explicit
 * `cartLineItems` param.
 */
function calculatePercentAmount(
	{
		amount,
		percent_of_cart_total_with_tax,
	}: {
		amount: number;
		percent_of_cart_total_with_tax: boolean;
	},
	cartLineItems: readonly LineItemInput[]
): number {
	const percentAmount = amount / 100;

	// Sum the total and total_tax of all line items
	const { cart_total, cart_total_tax } = (cartLineItems || []).reduce(
		(acc, item) => {
			if (isActiveLineItem(item)) {
				acc.cart_total += parseFloat(item.total ?? '0');
				acc.cart_total_tax += parseFloat(item.total_tax ?? '0');
			}
			return acc;
		},
		{ cart_total: 0, cart_total_tax: 0 }
	);

	const total = percent_of_cart_total_with_tax ? cart_total + cart_total_tax : cart_total;

	return total * percentAmount;
}

/**
 * The fee-line tax maths. Began as a port of `calculateFeeLineTaxesAndTotals`
 * (use-calculate-fee-line-tax-and-totals.ts); that hook was deleted once `useAddFee` and
 * `useUpdateFeeLine` came through here, so this is now the only copy — do not reintroduce
 * a second one in `packages/core`.
 */
function computeFeeLine(
	feeLine: FeeLineInput,
	cartLineItems: readonly LineItemInput[],
	config: CartConfig
): FeeLineInput {
	const { pricesIncludeTax, taxRoundAtSubtotal } = config;
	const { amount, percent, prices_include_tax, percent_of_cart_total_with_tax } =
		extractFeeLineData(feeLine as DbFeeLine, pricesIncludeTax);
	const dp = config.dp;
	const roundingPrecision = getRoundingPrecision(dp);
	let value = amount;

	if (percent) {
		value = calculatePercentAmount(
			{ amount: value, percent_of_cart_total_with_tax },
			cartLineItems
		);
	}

	const tax = calculateTaxesForValue(
		{
			amount: value,
			taxClass: feeLine.tax_class,
			taxStatus: feeLine.tax_status ?? 'taxable',
			amountIncludesTax: prices_include_tax,
		},
		config
	);

	const total = prices_include_tax ? value - tax.total : value;

	// When roundAtSubtotal=false, round tax to dp per-item
	// When roundAtSubtotal=true, leave at rounding precision
	// QUIRK(parity): rounding mode uses STORE config.pricesIncludeTax, NOT the line's own
	// prices_include_tax (unlike shipping). Pinned by the migrated fee tests in cart-line.test.ts.
	const storedPerRate = tax.taxes.map((t) => roundHalfUp(t.total, roundingPrecision));
	const roundedTotalTax = sumStoredLineTax(storedPerRate, dp, pricesIncludeTax, taxRoundAtSubtotal);

	return {
		...feeLine,
		total: String(roundHalfUp(total, roundingPrecision)),
		total_tax: String(roundedTotalTax),
		// Per-rate taxes are stored unrounded whatever taxRoundAtSubtotal says; only
		// total_tax above is rounded. See PER_RATE_TAXES_ARE_UNROUNDED.
		taxes: tax.taxes.map((t, index) => ({ ...t, total: String(storedPerRate[index]) })),
	};
}

/**
 * The shipping-line tax maths. Began as a port of `calculateShippingLineTaxesAndTotals`
 * (use-calculate-shipping-line-tax-and-totals.ts); that hook was deleted once `useAddShipping`
 * and `useUpdateShippingLine` came through here, so this is now the only copy — do not
 * reintroduce a second one in `packages/core`.
 */
function computeShippingLine(
	shippingLine: ShippingLineInput,
	config: CartConfig
): ShippingLineInput {
	const { pricesIncludeTax, taxRoundAtSubtotal } = config;
	const { amount, prices_include_tax, tax_status, tax_class } = extractShippingLineData(
		shippingLine as DbShippingLine,
		pricesIncludeTax,
		config.shippingTaxClass
	);
	const amountIncludesTax = prices_include_tax ?? pricesIncludeTax;
	const dp = config.dp;
	const roundingPrecision = getRoundingPrecision(dp);

	const tax = calculateTaxesForValue(
		{
			amount,
			taxClass: tax_class,
			taxStatus: tax_status,
			amountIncludesTax,
			shipping: true,
		},
		config
	);

	const total = amountIncludesTax ? amount - tax.total : amount;

	// When roundAtSubtotal=false, round tax to dp per-item
	// When roundAtSubtotal=true, leave at rounding precision
	//
	// The rounding MODE is a store-level property, not a per-line one. WooCommerce
	// defines `WC_TAX_ROUNDING_MODE` once, at boot, from the store option
	// (class-woocommerce.php:532):
	//
	//     $this->define( 'WC_TAX_ROUNDING_MODE',
	//         'yes' === get_option( 'woocommerce_prices_include_tax', 'no' ) ? 2 : 1 );
	//
	// and `wc_round_tax_total()` reads that constant for every value it rounds — a
	// shipping line's own `prices_include_tax` never reaches it. This used to pass the
	// PER-LINE `amountIncludesTax`, so a line that overrode the store setting rounded
	// half-DOWN where the store rounds half-UP (or vice versa) and landed a cent away
	// from the server on an exact half-cent tie. Same class as
	// PER_RATE_TAXES_ARE_UNROUNDED: a store-level rule applied at line level.
	const storedPerRate = tax.taxes.map((t) => roundHalfUp(t.total, roundingPrecision));
	const roundedTotalTax = sumStoredLineTax(storedPerRate, dp, pricesIncludeTax, taxRoundAtSubtotal);

	return {
		...shippingLine,
		total: String(roundHalfUp(total, roundingPrecision)),
		total_tax: String(roundedTotalTax),
		// Per-rate taxes are stored unrounded whatever taxRoundAtSubtotal says; only
		// total_tax above is rounded. See PER_RATE_TAXES_ARE_UNROUNDED.
		taxes: tax.taxes.map((t, index) => ({ ...t, total: String(storedPerRate[index]) })),
	};
}

// ===== entry point 2: calculateCartLine (mutation-time / frozen regime) =====

export function calculateCartLine(
	input: Extract<CartLineInput, { kind: 'line_item' }>,
	config: CartConfig
): CalcLineResult<LineItemInput>;
export function calculateCartLine(
	input: Extract<CartLineInput, { kind: 'fee' }>,
	config: CartConfig
): CalcLineResult<FeeLineInput>;
export function calculateCartLine(
	input: Extract<CartLineInput, { kind: 'shipping' }>,
	config: CartConfig
): CalcLineResult<ShippingLineInput>;
export function calculateCartLine(
	input: CartLineInput,
	config: CartConfig
): CalcLineResult<LineItemInput | FeeLineInput | ShippingLineInput> {
	const warnings: EngineWarning[] = [];

	switch (input.kind) {
		case 'line_item': {
			// Tombstone passthrough: returned unchanged, excluded from all math.
			if (!isActiveLineItem(input.line)) {
				return { line: input.line, warnings: [] };
			}
			detectMalformedPosData(input.line as DbLineItem, 'line_item', warnings);
			const line = input.changes
				? applyLineItemChanges(input.line, input.changes, config)
				: input.line;
			return { line: computeLineItem(line, config), warnings };
		}
		case 'fee': {
			if (!isActiveFeeLine(input.line)) {
				return { line: input.line, warnings: [] };
			}
			detectMalformedPosData(input.line as DbFeeLine, 'fee_line', warnings);
			const line = input.changes
				? applyFeeLineChanges(input.line, input.changes, config)
				: input.line;
			return { line: computeFeeLine(line, input.cartLineItems, config), warnings };
		}
		case 'shipping': {
			if (!isActiveShippingLine(input.line)) {
				return { line: input.line, warnings: [] };
			}
			detectMalformedPosData(input.line as DbShippingLine, 'shipping_line', warnings);
			const line = input.changes
				? applyShippingLineChanges(input.line, input.changes, config)
				: input.line;
			return { line: computeShippingLine(line, config), warnings };
		}
	}
}
