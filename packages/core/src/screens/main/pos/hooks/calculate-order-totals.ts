import round from 'lodash/round';
import sumBy from 'lodash/sumBy';

type TaxRateDocument = import('@wcpos/database').TaxRateDocument;
type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];

interface Props {
	lineItems?: LineItem[];
	shippingLines?: ShippingLine[];
	feeLines?: FeeLine[];
	taxRates?: TaxRateDocument[];
	taxRoundAtSubtotal?: boolean;
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
	return isNaN(value) ? 0 : parseFloat(value);
}

/**
 * @TODO - rounding?!
 */
export function calculateOrderTotals({
	lineItems = [],
	shippingLines = [],
	feeLines = [],
	taxRates = [],
	taxRoundAtSubtotal = false,
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

	// Initialize taxLines as an object
	const taxLines = taxRates.reduce<TaxLinesMap>((acc, taxRate) => {
		acc[taxRate.id] = {
			rate_id: taxRate.id,
			label: taxRate.name,
			compound: taxRate.compound,
			tax_total: 0,
			shipping_tax_total: 0,
			rate_percent: parseFloat(taxRate.rate),
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
				taxLines[tax.id].tax_total += parseNumber(tax.total);
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
				taxLines[tax.id].tax_total += parseNumber(tax.total);
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
				taxLines[tax.id].shipping_tax_total += parseNumber(tax.total);
			});
		}
	});

	// Sum the tax totals for cart_tax before converting to string
	const taxLinesArray = Object.values(taxLines) || [];
	cart_tax += sumBy(taxLinesArray, 'tax_total');

	const filteredTaxLines = taxLinesArray
		.map((taxLine) => {
			if (taxLine.tax_total === 0 && taxLine.shipping_tax_total === 0) {
				return null;
			}
			return {
				...taxLine,
				tax_total: String(round(taxLine.tax_total, 6)),
				shipping_tax_total: String(round(taxLine.shipping_tax_total, 6)),
			};
		})
		.filter(Boolean);

	return {
		/**
		 * These properties are stored on the order document
		 */
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
