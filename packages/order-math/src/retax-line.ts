import { consolidateTaxes } from './cart-line';
import { calculateTaxesForValue } from './internal/lines/calc-taxes-for-value';
import { extractLineItemData, extractShippingLineData } from './internal/lines/pos-data';
import { getRoundingPrecision, roundHalfUp } from './internal/money/precision';
import { sumStoredLineTax } from './internal/money/sum-taxes';
import {
	INHERIT_TAX_CLASS,
	NO_SHIPPING_TAX,
	resolveInheritedShippingTaxClass,
} from './internal/tax-class';
import { isActiveLineItem } from './snapshot';

import type { CartConfig } from './config';
import type { EngineWarning, FeeLineInput, LineItemInput, ShippingLineInput } from './types';

type DbLineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type DbShippingLine = NonNullable<
	import('@wcpos/database').OrderDocument['shipping_lines']
>[number];
type RetaxLineInput =
	| { kind: 'line_item'; line: LineItemInput }
	| { kind: 'fee'; line: FeeLineInput }
	| { kind: 'shipping'; line: ShippingLineInput; cartLineItems: readonly LineItemInput[] };

/**
 * Recompute tax fields only, like WC_Order_Item::calculate_taxes on stored ex-tax money.
 * calculateCartLine rebuilds total/subtotal from price × quantity, losing coupon discounts.
 * Without POS data it reconstructs price from the possibly discounted total; its changes
 * path stamps that basis into meta. Neither is appropriate when only taxes should change.
 */
export function retaxLine<T extends RetaxLineInput>(
	input: T,
	config: CartConfig
): { line: T['line']; warnings: EngineWarning[] } {
	const { pricesIncludeTax, taxRoundAtSubtotal, dp } = config;
	const roundingPrecision = getRoundingPrecision(dp);
	let taxClass: string | null | undefined;
	let taxStatus: string;
	if (input.kind === 'line_item') {
		taxClass = input.line.tax_class ?? '';
		taxStatus = extractLineItemData(input.line as DbLineItem, pricesIncludeTax).tax_status;
	} else if (input.kind === 'fee') {
		taxClass = input.line.tax_class;
		taxStatus = input.line.tax_status ?? 'taxable';
	} else {
		const { tax_class, tax_status } = extractShippingLineData(
			input.line as DbShippingLine,
			pricesIncludeTax,
			config.shippingTaxClass
		);
		const inherited =
			tax_class === INHERIT_TAX_CLASS
				? resolveInheritedShippingTaxClass(
						input.cartLineItems.filter(isActiveLineItem).map((item) => ({
							tax_class: item.tax_class,
							taxable:
								extractLineItemData(item as DbLineItem, pricesIncludeTax).tax_status === 'taxable',
						})),
						config.taxClassSlugs
					)
				: tax_class;
		taxClass = inherited ?? '';
		taxStatus = inherited === NO_SHIPPING_TAX ? 'none' : tax_status;
	}
	const args = {
		taxClass,
		taxStatus,
		amountIncludesTax: false,
		orderItem: true,
		shipping: input.kind === 'shipping',
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
		},
		warnings: [],
	};
}
