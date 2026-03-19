import type { ReceiptData } from './types';

/**
 * Format all numeric currency fields in ReceiptData as locale-aware currency
 * strings. Returns a new object suitable for Mustache template rendering.
 */
export function formatReceiptData(data: ReceiptData): Record<string, any> {
	const currency = data.meta.currency;
	const locale = data.presentation_hints?.locale || 'en-US';

	const fmt = (value: number): string => {
		try {
			return new Intl.NumberFormat(locale, {
				style: 'currency',
				currency,
			}).format(value);
		} catch {
			return value.toFixed(2);
		}
	};

	return {
		...data,
		lines: data.lines.map((line) => ({
			...line,
			unit_price_incl: fmt(line.unit_price_incl),
			unit_price_excl: fmt(line.unit_price_excl),
			line_subtotal_incl: fmt(line.line_subtotal_incl),
			line_subtotal_excl: fmt(line.line_subtotal_excl),
			line_total_incl: fmt(line.line_total_incl),
			line_total_excl: fmt(line.line_total_excl),
			discounts_incl: fmt(line.discounts_incl),
			discounts_excl: fmt(line.discounts_excl),
		})),
		fees: data.fees.map((fee) => ({
			...fee,
			total_incl: fmt(fee.total_incl),
			total_excl: fmt(fee.total_excl),
		})),
		shipping: data.shipping.map((s) => ({
			...s,
			total_incl: fmt(s.total_incl),
			total_excl: fmt(s.total_excl),
		})),
		discounts: data.discounts.map((d) => ({
			...d,
			total_incl: fmt(d.total_incl),
			total_excl: fmt(d.total_excl),
		})),
		totals: {
			...data.totals,
			subtotal_incl: fmt(data.totals.subtotal_incl),
			subtotal_excl: fmt(data.totals.subtotal_excl),
			discount_total_incl: fmt(data.totals.discount_total_incl),
			discount_total_excl: fmt(data.totals.discount_total_excl),
			tax_total: fmt(data.totals.tax_total),
			grand_total_incl: fmt(data.totals.grand_total_incl),
			grand_total_excl: fmt(data.totals.grand_total_excl),
			paid_total: fmt(data.totals.paid_total),
			change_total: fmt(data.totals.change_total),
		},
		tax_summary: data.tax_summary.map((tax) => ({
			...tax,
			tax_amount: fmt(tax.tax_amount),
			taxable_amount_incl: fmt(tax.taxable_amount_incl),
			taxable_amount_excl: fmt(tax.taxable_amount_excl),
		})),
		payments: data.payments.map((payment) => ({
			...payment,
			amount: fmt(payment.amount),
			tendered: payment.tendered != null ? fmt(payment.tendered) : undefined,
			change: payment.change != null ? fmt(payment.change) : undefined,
		})),
	};
}
