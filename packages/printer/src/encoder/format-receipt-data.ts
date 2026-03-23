import type { ReceiptData } from './types';

/**
 * Format all numeric currency fields in ReceiptData, adding locale-aware
 * `_display` variants while preserving the original numeric values for
 * Mustache section truthiness (e.g. {{#totals.discount_total_incl}}).
 *
 * Returns a new object suitable for Mustache template rendering.
 */
export function formatReceiptData(data: ReceiptData): Record<string, any> {
	const currency = data.meta.currency;
	if (!currency) {
		console.warn('formatReceiptData: missing currency in meta, formatting may be incomplete');
	}
	const locale = data.presentation_hints?.locale || 'en-US';

	const fmt = (value: number): string => {
		try {
			return new Intl.NumberFormat(locale, {
				style: 'currency',
				currency,
			}).format(value);
		} catch {
			return currency ? `${currency} ${value.toFixed(2)}` : value.toFixed(2);
		}
	};

	return {
		...data,
		lines: data.lines.map((line) => ({
			...line,
			unit_price_incl_display: fmt(line.unit_price_incl),
			unit_price_excl_display: fmt(line.unit_price_excl),
			line_subtotal_incl_display: fmt(line.line_subtotal_incl),
			line_subtotal_excl_display: fmt(line.line_subtotal_excl),
			line_total_incl_display: fmt(line.line_total_incl),
			line_total_excl_display: fmt(line.line_total_excl),
			discounts_incl_display: fmt(line.discounts_incl),
			discounts_excl_display: fmt(line.discounts_excl),
		})),
		fees: data.fees.map((fee) => ({
			...fee,
			total_incl_display: fmt(fee.total_incl),
			total_excl_display: fmt(fee.total_excl),
		})),
		shipping: data.shipping.map((s) => ({
			...s,
			total_incl_display: fmt(s.total_incl),
			total_excl_display: fmt(s.total_excl),
		})),
		discounts: data.discounts.map((d) => ({
			...d,
			total_incl_display: fmt(d.total_incl),
			total_excl_display: fmt(d.total_excl),
		})),
		totals: {
			...data.totals,
			subtotal_incl_display: fmt(data.totals.subtotal_incl),
			subtotal_excl_display: fmt(data.totals.subtotal_excl),
			discount_total_incl_display: fmt(data.totals.discount_total_incl),
			discount_total_excl_display: fmt(data.totals.discount_total_excl),
			tax_total_display: fmt(data.totals.tax_total),
			grand_total_incl_display: fmt(data.totals.grand_total_incl),
			grand_total_excl_display: fmt(data.totals.grand_total_excl),
			paid_total_display: fmt(data.totals.paid_total),
			change_total_display: fmt(data.totals.change_total),
		},
		tax_summary: data.tax_summary.map((tax) => ({
			...tax,
			tax_amount_display: fmt(tax.tax_amount),
			taxable_amount_incl_display: fmt(tax.taxable_amount_incl),
			taxable_amount_excl_display: fmt(tax.taxable_amount_excl),
		})),
		payments: data.payments.map((payment) => ({
			...payment,
			amount_display: fmt(payment.amount),
			tendered_display: payment.tendered != null ? fmt(payment.tendered) : undefined,
			change_display: payment.change != null ? fmt(payment.change) : undefined,
		})),
	};
}
