import type { ReceiptData } from './types';

function resolveDisplayValueSide(data: ReceiptData): 'incl' | 'excl' {
	const hints = data.presentation_hints;

	if (hints?.display_tax === 'incl' || hints?.display_tax === 'excl') {
		return hints.display_tax;
	}

	return hints?.prices_entered_with_tax === false ? 'excl' : 'incl';
}

const DEFAULT_I18N = {
	order: 'Order',
	date: 'Date',
	cashier: 'Cashier',
	customer: 'Customer',
	store_tax_id_label_other: 'Tax ID',
	customer_tax_id_label_other: 'Tax ID',
	subtotal: 'Subtotal',
	total: 'Total',
	refund_total: 'Refund Total',
	tendered: 'Tendered',
	change: 'Change',
	thank_you: 'Thank you',
	thank_you_purchase: 'Thank you for your purchase!',
};

/**
 * Built-in English labels for known tax-ID types. Used when the `label`
 * field is empty and no scoped i18n key is provided. Mirrors the labels
 * shipped in `Receipt_I18n_Labels::get_labels()` so studio renders look
 * the same as production renders even without the WP i18n dictionary
 * injected.
 */
const DEFAULT_TAX_ID_LABELS: Record<string, string> = {
	eu_vat: 'VAT ID',
	gb_vat: 'VAT No.',
	sa_vat: 'VAT No.',
	au_abn: 'ABN',
	br_cpf: 'CPF',
	br_cnpj: 'CNPJ',
	in_gst: 'GSTIN',
	it_cf: 'Codice Fiscale',
	it_piva: 'P.IVA',
	es_nif: 'NIF',
	ar_cuit: 'CUIT',
	ca_gst_hst: 'GST/HST No.',
	us_ein: 'EIN',
	de_ust_id: 'USt-IdNr.',
	de_steuernummer: 'Steuernummer',
	de_hrb: 'HRB',
	nl_kvk: 'KVK',
	fr_siret: 'SIRET',
	fr_siren: 'SIREN',
	gb_company: 'Company No.',
	ch_uid: 'UID',
};

/**
 * Resolve a display label for a `{ type, label?, value }` tax-ID entry.
 *
 * Order of precedence: explicit `label` → scope-specific i18n key
 * (`<scope>_tax_id_label_<type>`) → built-in default for the type →
 * scope-specific generic i18n key (`<scope>_tax_id_label_other`) →
 * "Tax ID".
 *
 * `scope` is `"store"` or `"customer"`; the same type may want a different
 * translation depending on which side of the receipt it sits on.
 */
function resolveTaxIdLabel(
	taxId: { type: string; label?: string | null },
	i18n: Record<string, string | undefined>,
	scope: 'store' | 'customer'
): string {
	const label = taxId.label?.trim();
	if (label) return label;

	const typeLabel = i18n[`${scope}_tax_id_label_${taxId.type}`]?.trim();
	if (typeLabel) return typeLabel;

	const builtIn = DEFAULT_TAX_ID_LABELS[taxId.type];
	if (builtIn) return builtIn;

	return (
		i18n[`${scope}_tax_id_label_other`]?.trim() ||
		DEFAULT_I18N[`${scope}_tax_id_label_other` as keyof typeof DEFAULT_I18N] ||
		'Tax ID'
	);
}

/**
 * Format all numeric currency fields in ReceiptData, adding locale-aware
 * `_display` variants while preserving source values for normal receipts.
 * Refund render data is signed for templates that print the raw fields.
 *
 * Returns a new object suitable for Mustache template rendering.
 */
export function formatReceiptData(data: ReceiptData): Record<string, any> {
	const currency = data.meta.currency;
	if (!currency) {
		console.warn('formatReceiptData: missing currency in meta, formatting may be incomplete');
	}
	const normalizedLocale = (data.presentation_hints?.locale || 'en-US').trim().replace(/_/g, '-');
	const displayTax = resolveDisplayValueSide(data);
	const isRefund = (data.refunds?.length ?? 0) > 0;
	const refundValue = (value: number): number =>
		isRefund && value !== 0 ? -Math.abs(value) : value;
	const refundPaymentTitle = (title: string): string => {
		if (!isRefund) return title;
		if (/^Refund\s[-—]\s/.test(title)) return title.replace(/^Refund\s[-—]\s/, 'Refund — ');
		return `Refund — ${title}`;
	};
	const i18n = {
		...DEFAULT_I18N,
		...data.i18n,
		total: isRefund
			? (data.i18n?.refund_total ?? data.i18n?.total ?? DEFAULT_I18N.refund_total)
			: (data.i18n?.total ?? DEFAULT_I18N.total),
	};

	const fmt = (value: number): string => {
		try {
			return new Intl.NumberFormat(normalizedLocale || 'en-US', {
				style: 'currency',
				currency,
			}).format(value);
		} catch {
			return currency ? `${currency} ${value.toFixed(2)}` : value.toFixed(2);
		}
	};

	return {
		...data,
		store: {
			...data.store,
			tax_ids: data.store.tax_ids?.map((taxId) => ({
				...taxId,
				label: resolveTaxIdLabel(taxId, i18n, 'store'),
			})),
		},
		customer: {
			...data.customer,
			tax_ids: data.customer.tax_ids?.map((taxId) => ({
				...taxId,
				label: resolveTaxIdLabel(taxId, i18n, 'customer'),
			})),
		},
		i18n,
		// Templates expect `order.{id, number, created.datetime, ...}` even when the source
		// data only carries `meta.*`. When the source already provides a fully populated
		// `data.order` (with locale-formatted ReceiptDateSchema), use it as-is — don't
		// downgrade to the raw GMT stub.
		order: data.order ?? {
			id: data.meta.order_id,
			number: data.meta.order_number,
			created: { datetime: data.meta.created_at_gmt },
		},
		lines: data.lines.map((line) => ({
			...line,
			unit_price: line.unit_price != null ? refundValue(line.unit_price) : line.unit_price,
			unit_price_incl: refundValue(line.unit_price_incl),
			unit_price_excl: refundValue(line.unit_price_excl),
			line_subtotal:
				line.line_subtotal != null ? refundValue(line.line_subtotal) : line.line_subtotal,
			line_subtotal_incl: refundValue(line.line_subtotal_incl),
			line_subtotal_excl: refundValue(line.line_subtotal_excl),
			line_total: line.line_total != null ? refundValue(line.line_total) : line.line_total,
			line_total_incl: refundValue(line.line_total_incl),
			line_total_excl: refundValue(line.line_total_excl),
			taxes: line.taxes.map((tax) => ({
				...tax,
				amount: refundValue(tax.amount),
				amount_display: fmt(refundValue(tax.amount)),
			})),
			unit_price_display: fmt(
				refundValue(
					line.unit_price ?? (displayTax === 'excl' ? line.unit_price_excl : line.unit_price_incl)
				)
			),
			unit_price_incl_display: fmt(refundValue(line.unit_price_incl)),
			unit_price_excl_display: fmt(refundValue(line.unit_price_excl)),
			line_subtotal_display: fmt(
				refundValue(
					line.line_subtotal ??
						(displayTax === 'excl' ? line.line_subtotal_excl : line.line_subtotal_incl)
				)
			),
			line_subtotal_incl_display: fmt(refundValue(line.line_subtotal_incl)),
			line_subtotal_excl_display: fmt(refundValue(line.line_subtotal_excl)),
			line_total_display: fmt(
				refundValue(
					line.line_total ?? (displayTax === 'excl' ? line.line_total_excl : line.line_total_incl)
				)
			),
			line_total_incl_display: fmt(refundValue(line.line_total_incl)),
			line_total_excl_display: fmt(refundValue(line.line_total_excl)),
			discounts_display: fmt(
				line.discounts ?? (displayTax === 'excl' ? line.discounts_excl : line.discounts_incl)
			),
			discounts_incl_display: fmt(line.discounts_incl),
			discounts_excl_display: fmt(line.discounts_excl),
		})),
		fees: data.fees.map((fee) => ({
			...fee,
			total_display: fmt(fee.total ?? (displayTax === 'excl' ? fee.total_excl : fee.total_incl)),
			total_incl_display: fmt(fee.total_incl),
			total_excl_display: fmt(fee.total_excl),
			taxes: fee.taxes?.map((tax) => ({
				...tax,
				amount_display: fmt(refundValue(tax.amount)),
			})),
		})),
		shipping: data.shipping.map((s) => ({
			...s,
			total_display: fmt(s.total ?? (displayTax === 'excl' ? s.total_excl : s.total_incl)),
			total_incl_display: fmt(s.total_incl),
			total_excl_display: fmt(s.total_excl),
			taxes: s.taxes?.map((tax) => ({
				...tax,
				amount_display: fmt(refundValue(tax.amount)),
			})),
		})),
		discounts: data.discounts.map((d) => ({
			...d,
			total_display: fmt(d.total ?? (displayTax === 'excl' ? d.total_excl : d.total_incl)),
			total_incl_display: fmt(d.total_incl),
			total_excl_display: fmt(d.total_excl),
		})),
		totals: {
			...data.totals,
			subtotal:
				data.totals.subtotal != null ? refundValue(data.totals.subtotal) : data.totals.subtotal,
			subtotal_incl: refundValue(data.totals.subtotal_incl),
			subtotal_excl: refundValue(data.totals.subtotal_excl),
			tax_total: refundValue(data.totals.tax_total),
			total: data.totals.total != null ? refundValue(data.totals.total) : data.totals.total,
			total_incl: refundValue(data.totals.total_incl),
			total_excl: refundValue(data.totals.total_excl),
			paid_total: refundValue(data.totals.paid_total),
			subtotal_display: fmt(
				refundValue(
					data.totals.subtotal ??
						(displayTax === 'excl' ? data.totals.subtotal_excl : data.totals.subtotal_incl)
				)
			),
			subtotal_incl_display: fmt(refundValue(data.totals.subtotal_incl)),
			subtotal_excl_display: fmt(refundValue(data.totals.subtotal_excl)),
			discount_total_display: fmt(
				data.totals.discount_total ??
					(displayTax === 'excl'
						? data.totals.discount_total_excl
						: data.totals.discount_total_incl)
			),
			discount_total_incl_display: fmt(data.totals.discount_total_incl),
			discount_total_excl_display: fmt(data.totals.discount_total_excl),
			tax_total_display: fmt(refundValue(data.totals.tax_total)),
			total_display: fmt(
				refundValue(
					data.totals.total ??
						(displayTax === 'excl' ? data.totals.total_excl : data.totals.total_incl)
				)
			),
			total_incl_display: fmt(refundValue(data.totals.total_incl)),
			total_excl_display: fmt(refundValue(data.totals.total_excl)),
			paid_total_display: fmt(refundValue(data.totals.paid_total)),
			change_total_display: fmt(data.totals.change_total),
		},
		tax_summary: data.tax_summary.map((tax) => ({
			...tax,
			tax_amount: refundValue(tax.tax_amount),
			taxable_amount_incl:
				tax.taxable_amount_incl != null ? refundValue(tax.taxable_amount_incl) : null,
			taxable_amount_excl:
				tax.taxable_amount_excl != null ? refundValue(tax.taxable_amount_excl) : null,
			tax_amount_display: fmt(refundValue(tax.tax_amount)),
			taxable_amount_incl_display:
				tax.taxable_amount_incl != null ? fmt(refundValue(tax.taxable_amount_incl)) : '',
			taxable_amount_excl_display:
				tax.taxable_amount_excl != null ? fmt(refundValue(tax.taxable_amount_excl)) : '',
		})),
		payments: data.payments.map((payment) => ({
			...payment,
			method_title: refundPaymentTitle(payment.method_title),
			amount: refundValue(payment.amount),
			amount_display: fmt(refundValue(payment.amount)),
			tendered_display: payment.tendered != null ? fmt(payment.tendered) : undefined,
			change_display: payment.change != null ? fmt(payment.change) : undefined,
		})),
	};
}
