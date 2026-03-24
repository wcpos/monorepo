import sumBy from 'lodash/sumBy';

import { roundHalfUp, roundTaxTotal } from '../../hooks/utils/precision';

type TaxRateDocument = import('@wcpos/database').TaxRateDocument;
type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
type CouponLine = NonNullable<import('@wcpos/database').OrderDocument['coupon_lines']>[number];

interface Props {
	lineItems?: LineItem[];
	shippingLines?: ShippingLine[];
	feeLines?: FeeLine[];
	couponLines?: CouponLine[];
	taxRates?: TaxRateDocument[];
	taxRoundAtSubtotal?: boolean;
	dp?: number;
	pricesIncludeTax?: boolean;
}

interface TaxLine {
	rate_id: number;
	label: string;
	compound: boolean;
	tax_total: number;
	shipping_tax_total: number;
	rate_percent: number;
	meta_data: any[];
}

// Define a type for the accumulator in the reduce function
type TaxLinesMap = Record<string, TaxLine>;

/**
 *
 */
function parseNumber(value: any): number {
	if (value == null || isNaN(value)) {
		return 0;
	}
	const parsed = parseFloat(value);
	return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculate order totals from line items, fees, shipping, and coupons.
 *
 * When taxRoundAtSubtotal=true, tax values on individual lines are at rounding precision
 * and the final aggregated tax_total/shipping_tax_total is rounded to dp once.
 *
 * When taxRoundAtSubtotal=false (default), taxes were already rounded per-item to dp.
 *
 * @param dp - Price decimal places (default 2)
 * @param pricesIncludeTax - Whether prices include tax (affects rounding mode)
 */
export function calculateOrderTotals({
	lineItems = [],
	shippingLines = [],
	feeLines = [],
	couponLines = [],
	taxRates = [],
	taxRoundAtSubtotal = false,
	dp = 2,
	pricesIncludeTax = false,
}: Props) {
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
	let coupon_total = 0;
	let coupon_tax = 0;

	// Initialize taxLines as an object
	const taxLines = taxRates.reduce<TaxLinesMap>((acc, taxRate) => {
		const rateId = taxRate.id ?? 0;
		acc[rateId] = {
			rate_id: rateId,
			label: taxRate.name ?? '',
			compound: taxRate.compound ?? false,
			tax_total: 0,
			shipping_tax_total: 0,
			rate_percent: parseFloat(taxRate.rate ?? '0'),
			meta_data: [],
		};
		return acc;
	}, {});

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
				taxLines[tax.id ?? 0].tax_total += parseNumber(tax.total);
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
				taxLines[tax.id ?? 0].tax_total += parseNumber(tax.total);
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
				taxLines[tax.id ?? 0].shipping_tax_total += parseNumber(tax.total);
			});
		}
	});

	// Accumulate coupon totals for display purposes only.
	// Coupon discounts are already reflected in line_items (subtotal vs total),
	// so we must NOT re-adjust discount_total/total here.
	couponLines.forEach((line) => {
		coupon_total += parseNumber(line.discount);
		coupon_tax += parseNumber(line.discount_tax);
	});

	// Sum the tax totals for cart_tax before converting to string
	const taxLinesArray = Object.values(taxLines) || [];

	// When taxRoundAtSubtotal=true, WC keeps per-rate taxes at full precision
	// and only rounds the final aggregated total (cart_tax, total_tax).
	// When taxRoundAtSubtotal=false, taxes were already rounded per-item.
	//
	// For tax_lines display we always round to dp. But for cart_tax/total_tax
	// we sum at full precision first, then round — matching WC's update_taxes().
	const fullPrecisionCartTax = taxLinesArray.reduce((sum, tl) => sum + tl.tax_total, 0);
	const fullPrecisionShippingTax = taxLinesArray.reduce(
		(sum, tl) => sum + tl.shipping_tax_total,
		0
	);

	const filteredTaxLines = taxLinesArray
		.map((taxLine) => {
			const { tax_total, shipping_tax_total } = taxLine;

			if (tax_total === 0 && shipping_tax_total === 0) {
				return null;
			}
			return {
				...taxLine,
				tax_total: String(roundTaxTotal(tax_total, dp, pricesIncludeTax)),
				shipping_tax_total: String(roundTaxTotal(shipping_tax_total, dp, pricesIncludeTax)),
			};
		})
		.filter((line): line is NonNullable<typeof line> => line !== null);

	// cart_tax and total_tax: round the full-precision sum, not the sum of rounded values.
	// This matches WC's update_taxes() which accumulates unrounded per-item taxes
	// then rounds the final total.
	const roundedCartTax = roundTaxTotal(fullPrecisionCartTax, dp, pricesIncludeTax);
	const roundedShippingTax = roundTaxTotal(fullPrecisionShippingTax, dp, pricesIncludeTax);
	const roundedTotalTax = roundedCartTax + roundedShippingTax;

	return {
		/**
		 * These properties are stored on the order document
		 */
		discount_total: String(roundHalfUp(discount_total, dp)),
		discount_tax: String(roundHalfUp(discount_tax, dp)),
		shipping_total: String(roundHalfUp(shipping_total, dp)),
		shipping_tax: String(roundHalfUp(roundedShippingTax, dp)),
		cart_tax: String(roundHalfUp(roundedCartTax, dp)),
		total: String(roundHalfUp(total + roundedTotalTax, dp)),
		total_tax: String(roundHalfUp(roundedTotalTax, dp)),
		tax_lines: filteredTaxLines,
		/**
		 * Subtotals are not stored on the order document, but we need them to display in the cart
		 */
		subtotal: String(roundHalfUp(subtotal, dp)),
		subtotal_tax: String(roundHalfUp(subtotal_tax, dp)),
		/**
		 * Need to add fee_total to display in the cart, to match the WC Admin display
		 */
		fee_total: String(roundHalfUp(fee_total, dp)),
		fee_tax: String(roundHalfUp(fee_tax, dp)),
		coupon_total: String(roundHalfUp(coupon_total, dp)),
		coupon_tax: String(roundHalfUp(coupon_tax, dp)),
	};
}
