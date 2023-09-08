import * as React from 'react';

import round from 'lodash/round';
import { useObservableRef } from 'observable-hooks';

import { useTaxHelpers } from '../../contexts/tax-helpers';

type LineItemDocument = import('@wcpos/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/database').ShippingLineDocument;
type TaxRateDocument = import('@wcpos/database').TaxRateDocument;

/**
 *
 */
function parseNumber(value: any): number {
	return isNaN(value) ? 0 : parseFloat(value);
}

/**
 *
 */
function calculateOrderTotalsAndTaxes({
	lineItems,
	shippingLines,
	feeLines,
	taxRates,
	taxRoundAtSubtotal,
}: {
	lineItems: LineItemDocument[];
	shippingLines: ShippingLineDocument[];
	feeLines: FeeLineDocument[];
	taxRates: TaxRateDocument[];
	taxRoundAtSubtotal: boolean;
}) {
	let discount_total = 0;
	let discount_tax = 0;
	let shipping_total = 0;
	let shipping_tax = 0;
	let cart_tax = 0;
	let subtotal = 0;
	let subtotal_tax = 0;
	let total = 0;
	let total_tax = 0;
	let fee_total = 0;
	let fee_tax = 0;

	const taxLines = taxRates.map((taxRate) => ({
		rate_id: parseInt(taxRate.id, 10),
		label: taxRate.name,
		compound: taxRate.compound,
		tax_total: 0,
		shipping_tax_total: 0,
		rate_percent: parseFloat(taxRate.rate),
		meta_data: [],
	}));

	// Calculate line item totals
	lineItems.forEach((item) => {
		const parsedSubtotal = parseNumber(item.subtotal);
		const parsedTotal = parseNumber(item.total);
		const parsedSubtotalTax = parseNumber(item.subtotal_tax);
		const parsedTotalTax = parseNumber(item.total_tax);

		discount_total += parsedSubtotal - parsedTotal;
		discount_tax += parsedSubtotalTax - parsedTotalTax;
		subtotal += parsedSubtotal;
		subtotal_tax += parsedSubtotalTax;
		total += parsedTotal;
		total_tax += parsedTotalTax;

		if (Array.isArray(item.taxes)) {
			item.taxes.forEach((tax) => {
				const taxLine = taxLines.find((taxLine) => taxLine.rate_id === parseInt(tax.id, 10));
				if (taxLine) {
					taxLine.tax_total += parseNumber(tax.total);
				}
			});
		}
	});

	// Calculate fee totals
	feeLines.forEach((line) => {
		fee_total += parseNumber(line.total);
		fee_tax += parseNumber(line.total_tax);
		total += parseNumber(line.total);
		total_tax += parseNumber(line.total_tax);

		if (Array.isArray(line.taxes)) {
			line.taxes.forEach((tax) => {
				const taxLine = taxLines.find((taxLine) => taxLine.rate_id === parseInt(tax.id, 10));
				if (taxLine) {
					taxLine.tax_total += parseNumber(tax.total);
				}
			});
		}
	});

	// Calculate shipping totals
	shippingLines.forEach((line) => {
		shipping_total += parseNumber(line.total);
		shipping_tax += parseNumber(line.total_tax);
		total += parseNumber(line.total);
		total_tax += parseNumber(line.total_tax);

		if (Array.isArray(line.taxes)) {
			line.taxes.forEach((tax) => {
				const taxLine = taxLines.find((taxLine) => taxLine.rate_id === parseInt(tax.id, 10));
				if (taxLine) {
					taxLine.shipping_tax_total += parseNumber(tax.total);
				}
			});
		}
	});

	taxLines.forEach((taxLine) => {
		cart_tax += taxLine.tax_total;
		taxLine.tax_total = String(round(taxLine.tax_total, 6));
		taxLine.shipping_tax_total = String(round(taxLine.shipping_tax_total, 6));
	});

	// Remove tax lines with 0 tax total
	const filteredTaxLines = taxLines.filter((taxLine) => parseFloat(taxLine.tax_total) !== 0);

	return {
		discount_total: String(round(discount_total, 6)),
		discount_tax: String(round(discount_tax, 6)),
		shipping_total: String(round(shipping_total, 6)),
		shipping_tax: String(round(shipping_tax, 6)),
		cart_tax: String(round(cart_tax, 6)),
		total: String(round(total + total_tax, 6)),
		total_tax: String(round(total_tax, 6)),
		tax_lines: filteredTaxLines,
		/**
		 * Subtotals are not stored on the order document, but we need them to display in the cart
		 */
		subtotal: String(round(subtotal, 6)),
		subtotal_tax: String(round(subtotal_tax, 6)),
		/**
		 * Need to add fee_total to display in the cart, to match the WC Admin display
		 */
		fee_total: String(round(fee_total, 6)),
		fee_tax: String(round(fee_tax, 6)),
	};
}

/**
 *
 */
export const useTotalsCalculation = (order) => {
	const { rates, taxRoundAtSubtotal } = useTaxHelpers();
	const [extraTotalsRef, extraTotals$] = useObservableRef({
		subtotal: '0',
		subtotal_tax: '0',
		fee_total: '0',
		fee_tax: '0',
	});

	/**
	 *
	 */
	const calculateOrderTotals = React.useCallback(
		({ lineItems, feeLines, shippingLines }) => {
			const totals = calculateOrderTotalsAndTaxes({
				lineItems,
				feeLines,
				shippingLines,
				taxRates: rates, // NOTE: rates are only used to extract label and compound, not for calculation
				taxRoundAtSubtotal,
			});
			order.incrementalPatch({
				discount_tax: totals.discount_tax,
				discount_total: totals.discount_total,
				shipping_tax: totals.shipping_tax,
				shipping_total: totals.shipping_total,
				cart_tax: totals.cart_tax,
				total_tax: totals.total_tax,
				total: totals.total,
				tax_lines: totals.tax_lines,
			});
			extraTotalsRef.current = {
				subtotal: totals.subtotal,
				subtotal_tax: totals.subtotal_tax,
				fee_total: totals.fee_total,
				fee_tax: totals.fee_tax,
			};
		},
		[rates, taxRoundAtSubtotal, order, extraTotalsRef]
	);

	return { calculateOrderTotals, extraTotals$ };
};
