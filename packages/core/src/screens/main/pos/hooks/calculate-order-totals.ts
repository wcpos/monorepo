import sumBy from 'lodash/sumBy';

import { getRoundingPrecision, roundHalfUp, roundTaxTotal } from '../../hooks/utils/precision';

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
	// Filter out items marked for deletion. WCPOS nulls a key field to signal
	// the server should delete the item: product_id (line_items), name (fee_lines),
	// method_id (shipping_lines), code (coupon_lines). These must never contribute
	// to totals regardless of whether the caller pre-filters.
	const activeLineItems = lineItems.filter((item) => item.product_id !== null);
	const activeFeeLines = feeLines.filter((item) => item.name !== null);
	const activeShippingLines = shippingLines.filter((item) => item.method_id !== null);
	// Loose != null also excludes undefined, matching existing use-cart-lines patterns
	const activeCouponLines = couponLines.filter((item) => item.code != null);

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
	//
	// WC computes order totals using get_cart_subtotal_for_order() / get_cart_total_for_order(),
	// which call get_rounded_items_total() → round_item_subtotal(). When taxRoundAtSubtotal
	// is false (default), each item is rounded to dp (cents) before summing. When true, items
	// are kept at full precision. This per-item rounding affects discount_total and order.total.
	activeLineItems.forEach((item) => {
		const parsedSubtotal = parseNumber(item.subtotal);
		const parsedTotal = parseNumber(item.total);
		const parsedSubtotalTax = parseNumber(item.subtotal_tax);
		const parsedTotalTax = parseNumber(item.total_tax);

		// Per-item rounded values matching WC's get_rounded_items_total()
		const roundedItemSubtotal = taxRoundAtSubtotal
			? parsedSubtotal
			: roundHalfUp(parsedSubtotal, dp);
		const roundedItemTotal = taxRoundAtSubtotal ? parsedTotal : roundHalfUp(parsedTotal, dp);

		discount_total += roundedItemSubtotal - roundedItemTotal;

		// WC accumulates discount_tax per tax rate from the taxes[] array,
		// NOT from the collapsed subtotal_tax/total_tax. This matters for
		// multi-rate items where round(a+b, 6) ≠ round(a, 6) + round(b, 6).
		// Pre-round each per-rate difference to rounding precision (6dp) to
		// snap IEEE 754 float artifacts (e.g., 4.5 - 4.275 = 0.22499...).
		const hasPerRateSubtotals =
			Array.isArray(item.taxes) && item.taxes.length > 0 && item.taxes[0].subtotal != null;
		if (hasPerRateSubtotals) {
			item.taxes!.forEach((tax) => {
				const subtotalTaxForRate = parseNumber(tax.subtotal);
				const totalTaxForRate = parseNumber(tax.total);
				discount_tax += roundHalfUp(subtotalTaxForRate - totalTaxForRate, getRoundingPrecision(dp));
			});
		} else {
			// Fallback: use line-level subtotal_tax/total_tax when per-rate subtotals
			// are not available (e.g., taxes array missing or without subtotal field).
			discount_tax += roundHalfUp(parsedSubtotalTax - parsedTotalTax, getRoundingPrecision(dp));
		}

		// Use per-item-rounded values for subtotal/total (matches WC's calculate_totals)
		subtotal += roundedItemSubtotal;
		subtotal_tax += parsedSubtotalTax;
		total += roundedItemTotal;
		total_tax += parsedTotalTax;

		if (Array.isArray(item.taxes)) {
			item.taxes.forEach((tax) => {
				const taxAmount = parseNumber(tax.total);
				// When taxRoundAtSubtotal=false, WC rounds each per-item per-rate tax
				// to dp before summing into tax_lines (matching update_taxes() behavior).
				// When true, taxes accumulate at full precision and round only at the end.
				taxLines[tax.id ?? 0].tax_total += taxRoundAtSubtotal
					? taxAmount
					: roundTaxTotal(taxAmount, dp, pricesIncludeTax);
			});
		}
	});

	// Helper: accumulate per-rate taxes into taxLines with conditional rounding.
	// Shared by fee and shipping lines to avoid the same parity bug as lineItems.
	const accumulateTaxes = (
		taxes: any[] | undefined,
		target: 'tax_total' | 'shipping_tax_total'
	) => {
		if (!Array.isArray(taxes)) return;
		taxes.forEach((tax) => {
			const taxAmount = parseNumber(tax.total);
			taxLines[tax.id ?? 0][target] += taxRoundAtSubtotal
				? taxAmount
				: roundTaxTotal(taxAmount, dp, pricesIncludeTax);
		});
	};

	// Calculate fee totals
	activeFeeLines.forEach((line) => {
		fee_total += parseNumber(line.total);
		fee_tax += parseNumber(line.total_tax);
		total += parseNumber(line.total);
		total_tax += parseNumber(line.total_tax);
		accumulateTaxes(line.taxes, 'tax_total');
	});

	// Calculate shipping totals
	activeShippingLines.forEach((line) => {
		shipping_total += parseNumber(line.total);
		shipping_tax += parseNumber(line.total_tax);
		total += parseNumber(line.total);
		total_tax += parseNumber(line.total_tax);
		accumulateTaxes(line.taxes, 'shipping_tax_total');
	});

	// Accumulate coupon totals for display purposes only.
	// Coupon discounts are already reflected in line_items (subtotal vs total),
	// so we must NOT re-adjust discount_total/total here.
	activeCouponLines.forEach((line) => {
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

	// WC stores cart_tax and shipping_tax at full precision (array_sum of per-rate
	// taxes), but rounds total_tax to dp. Match that behavior.
	const roundedCartTax = fullPrecisionCartTax;
	const roundedShippingTax = fullPrecisionShippingTax;
	const roundedTotalTax = roundTaxTotal(roundedCartTax + roundedShippingTax, dp, pricesIncludeTax);

	return {
		/**
		 * These properties are stored on the order document
		 */
		discount_total: String(roundHalfUp(discount_total, dp)),
		discount_tax: String(roundTaxTotal(discount_tax, dp, pricesIncludeTax)),
		shipping_total: String(roundHalfUp(shipping_total, dp)),
		shipping_tax: String(
			roundTaxTotal(roundedShippingTax, dp, pricesIncludeTax, getRoundingPrecision(dp))
		),
		cart_tax: String(roundTaxTotal(roundedCartTax, dp, pricesIncludeTax, getRoundingPrecision(dp))),
		total: String(roundHalfUp(total + roundedTotalTax, dp)),
		total_tax: String(roundTaxTotal(roundedTotalTax, dp, pricesIncludeTax)),
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
