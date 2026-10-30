import { calculateTaxesForValue } from './internal/lines/calc-taxes-for-value';
import { consolidateTaxes } from './internal/lines/consolidate-taxes';
import { extractLineItemData } from './internal/lines/pos-data';
import { getRoundingPrecision, roundHalfUp } from './internal/money/precision';
import { sumStoredLineTax } from './internal/money/sum-taxes';
import { isActiveFeeLine, isActiveLineItem } from './snapshot';

import type { CalcLineResult } from './cart-line';
import type { CartConfig } from './config';
import type { FeeLineInput, LineItemInput } from './types';

type DbLineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
export type RetaxLineInput =
	| { kind: 'line_item'; line: LineItemInput; taxStatus?: 'taxable' | 'none' | 'shipping' }
	| { kind: 'fee'; line: FeeLineInput };

/**
 * Recompute tax fields only, like WC_Order_Item::calculate_taxes on stored ex-tax money.
 * calculateCartLine rebuilds total/subtotal from price × quantity, losing coupon discounts.
 * Without POS data it reconstructs price from the possibly discounted total; its changes
 * path stamps that basis into meta. Neither is appropriate when only taxes should change.
 */
export function retaxLine(
	input: Extract<RetaxLineInput, { kind: 'line_item' }>,
	config: CartConfig
): CalcLineResult<LineItemInput>;
export function retaxLine(
	input: Extract<RetaxLineInput, { kind: 'fee' }>,
	config: CartConfig
): CalcLineResult<FeeLineInput>;
export function retaxLine(
	input: RetaxLineInput,
	config: CartConfig
): CalcLineResult<LineItemInput | FeeLineInput> {
	if (input.kind === 'line_item' ? !isActiveLineItem(input.line) : !isActiveFeeLine(input.line)) {
		return { line: input.line, warnings: [] };
	}
	const { pricesIncludeTax, taxRoundAtSubtotal, dp } = config;
	const roundingPrecision = getRoundingPrecision(dp);
	let taxClass: string | null | undefined;
	let taxStatus: string;
	if (input.kind === 'line_item') {
		taxClass = input.line.tax_class ?? '';
		taxStatus =
			input.taxStatus ?? extractLineItemData(input.line as DbLineItem, pricesIncludeTax).tax_status;
	} else {
		taxClass = input.line.tax_class;
		taxStatus = input.line.tax_status ?? 'taxable';
	}
	const args = {
		taxClass,
		taxStatus: input.kind === 'line_item' && taxStatus !== 'taxable' ? 'none' : taxStatus,
		amountIncludesTax: false,
		orderItem: true,
	};
	const totalTaxes = calculateTaxesForValue(
		{ ...args, amount: Number(input.line.total ?? 0) },
		config
	);
	const storedPerRate = totalTaxes.taxes.map((tax) => roundHalfUp(tax.total, roundingPrecision));
	const total_tax = String(
		sumStoredLineTax(storedPerRate, dp, pricesIncludeTax, taxRoundAtSubtotal)
	);
	if (input.kind === 'line_item') {
		const subtotalTaxes = calculateTaxesForValue(
			{ ...args, amount: Number(input.line.subtotal ?? 0) },
			config
		);
		const storedSubtotal = subtotalTaxes.taxes.map((tax) =>
			roundHalfUp(tax.total, roundingPrecision)
		);
		return {
			line: {
				...input.line,
				total_tax,
				subtotal_tax: String(
					sumStoredLineTax(storedSubtotal, dp, pricesIncludeTax, taxRoundAtSubtotal)
				),
				taxes: consolidateTaxes(subtotalTaxes, totalTaxes, false, roundingPrecision),
				...(config.vatExempt && { taxes: [], total_tax: '0', subtotal_tax: '0' }),
			},
			warnings: [],
		};
	}
	return {
		line: {
			...input.line,
			total_tax,
			taxes: totalTaxes.taxes.map((tax, index) => ({
				...tax,
				total: String(storedPerRate[index]),
			})),
			...(config.vatExempt && { taxes: [], total_tax: '0' }),
		},
		warnings: [],
	};
}
