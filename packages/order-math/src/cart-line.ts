import find from 'lodash/find';
import uniq from 'lodash/uniq';

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

// DB element types — used only for casts at the pos-data helper boundary.
// (The structural Input types are supertypes of these; see types.assignability.test.ts.)
type DbLineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type DbFeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
type DbShippingLine = NonNullable<
	import('@wcpos/database').OrderDocument['shipping_lines']
>[number];

type Tax = { id: number; total: number };

// ===== public types (SPEC §3) =====

export interface LineItemChanges {
	quantity?: number;
	price?: number;
	regular_price?: number;
	tax_status?: 'taxable' | 'none';
	tax_class?: string;
	name?: string;
	sku?: string;
}

export interface FeeLineChanges {
	name?: string;
	amount?: number;
	percent?: boolean;
	prices_include_tax?: boolean;
	percent_of_cart_total_with_tax?: boolean;
	tax_status?: 'taxable' | 'none';
	tax_class?: string;
}

export interface ShippingLineChanges {
	method_title?: string;
	method_id?: string;
	amount?: number;
	tax_status?: 'taxable' | 'none';
	tax_class?: string;
	prices_include_tax?: boolean;
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
 * (invalid JSON, or the literal JSON `null`), so extract* silently fell back
 * to totals-derived defaults.
 */
function detectMalformedPosData(
	line: CartLine,
	lineType: WarningSite['lineType'],
	warnings: EngineWarning[]
): void {
	const posDataString = getMetaDataValueByKey(line.meta_data, '_woocommerce_pos_data');
	if (posDataString && parsePosData(line) == null) {
		warnings.push({ code: 'malformed_pos_data', where: { lineType, index: -1 } });
	}
}

// ===== changes merges (ports of the use-update-* hooks' merge blocks) =====

/**
 * Port of the changes-merge block in `useUpdateLineItem` (use-update-line-item.ts):
 * `price`/`regular_price`/`tax_status` go into `_woocommerce_pos_data` with
 * `?? prev` fallbacks; everything else merges top-level. The hook's optional
 * `virtual`/`downloadable`/`categories` posData passthroughs have no equivalent
 * in `LineItemChanges`, so they drop out.
 */
function applyLineItemChanges(
	line: LineItemInput,
	changes: LineItemChanges,
	config: CartConfig
): LineItemInput {
	// get previous line data from meta_data
	const prevData = extractLineItemData(line as DbLineItem, config.pricesIncludeTax);

	// extract the meta_data from the changes
	const { price, regular_price, tax_status, ...rest } = changes;

	// merge the previous line data with the rest of the changes
	const updatedItem = { ...line, ...rest };

	return updatePosDataMeta(updatedItem as DbLineItem, {
		price: price ?? prevData.price,
		regular_price: regular_price ?? prevData.regular_price,
		tax_status: tax_status ?? prevData.tax_status,
	});
}

/**
 * Port of the changes-merge block in `useUpdateFeeLine` (use-update-fee-line.ts):
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
 * Port of the changes-merge block in `useUpdateShippingLine` (use-update-shipping-line.ts):
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
 * When roundAtSubtotal=false, each per-rate tax is rounded to dp before output.
 * When roundAtSubtotal=true, taxes are left at full precision (deferred to order totals).
 *
 * Moved verbatim from use-calculate-line-item-tax-and-totals.ts.
 */
const consolidateTaxes = (
	subtotalTaxes: { taxes: Tax[] },
	totalTaxes: { taxes: Tax[] },
	noSubtotal: boolean,
	dp: number,
	pricesIncludeTax: boolean,
	roundAtSubtotal: boolean
) => {
	const uniqueTaxIds = uniq([
		...subtotalTaxes.taxes.map((tax) => tax.id),
		...totalTaxes.taxes.map((tax) => tax.id),
	]);

	return uniqueTaxIds.map((id) => {
		const subtotalTax = find(subtotalTaxes.taxes, { id }) || { total: 0 };
		const totalTax = find(totalTaxes.taxes, { id }) || { total: 0 };

		// When roundAtSubtotal=false, round each per-rate tax to dp (matches WC per-item rounding)
		// When roundAtSubtotal=true, leave at rounding precision (deferred to order totals)
		const roundedSubtotalTax = roundAtSubtotal
			? subtotalTax.total
			: roundTaxTotal(subtotalTax.total, dp, pricesIncludeTax);
		const roundedTotalTax = roundAtSubtotal
			? totalTax.total
			: roundTaxTotal(totalTax.total, dp, pricesIncludeTax);

		return {
			id,
			subtotal: noSubtotal ? '' : String(roundedSubtotalTax),
			total: String(roundedTotalTax),
		};
	});
};

/**
 * Port of `calculateLineItemTaxesAndTotals` (use-calculate-line-item-tax-and-totals.ts).
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

	// When roundAtSubtotal=false, round total_tax to dp (per-item rounding)
	// When roundAtSubtotal=true, leave at rounding precision
	const roundedTotalTax = taxRoundAtSubtotal
		? totalTaxResult.total
		: roundTaxTotal(totalTaxResult.total, dp, pricesIncludeTax);
	const roundedSubtotalTax = taxRoundAtSubtotal
		? subtotalTaxResult.total
		: roundTaxTotal(subtotalTaxResult.total, dp, pricesIncludeTax);

	// Calculate total and subtotal excluding tax
	const totalExclTax = pricesIncludeTax ? total - totalTaxResult.total : total;
	const subtotalExclTax = pricesIncludeTax ? subtotal - subtotalTaxResult.total : subtotal;

	// Calculate price per unit excluding tax
	const priceWithoutTax = pricesIncludeTax ? price - perUnitTaxResult.total : price;

	// Consolidate taxes
	const taxes = consolidateTaxes(
		subtotalTaxResult,
		totalTaxResult,
		false,
		dp,
		pricesIncludeTax,
		taxRoundAtSubtotal
	);

	// Line-level values (total, subtotal, price) are stored at rounding precision (6dp)
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
 * Port of `calculateFeeLineTaxesAndTotals` (use-calculate-fee-line-tax-and-totals.ts).
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
	const roundedTotalTax = taxRoundAtSubtotal
		? tax.total
		: roundTaxTotal(tax.total, dp, pricesIncludeTax);

	return {
		...feeLine,
		total: String(roundHalfUp(total, roundingPrecision)),
		total_tax: String(roundedTotalTax),
		taxes: tax.taxes.map((t) => ({
			...t,
			total: String(taxRoundAtSubtotal ? t.total : roundTaxTotal(t.total, dp, pricesIncludeTax)),
		})),
	};
}

/**
 * Port of `calculateShippingLineTaxesAndTotals` (use-calculate-shipping-line-tax-and-totals.ts).
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
	// QUIRK(parity): rounding mode uses the PER-LINE amountIncludesTax (unlike fees, which
	// use store pricesIncludeTax). Pinned by the migrated shipping tests in cart-line.test.ts.
	const roundedTotalTax = taxRoundAtSubtotal
		? tax.total
		: roundTaxTotal(tax.total, dp, amountIncludesTax);

	return {
		...shippingLine,
		total: String(roundHalfUp(total, roundingPrecision)),
		total_tax: String(roundedTotalTax),
		taxes: tax.taxes.map((t) => ({
			...t,
			total: String(taxRoundAtSubtotal ? t.total : roundTaxTotal(t.total, dp, amountIncludesTax)),
		})),
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
