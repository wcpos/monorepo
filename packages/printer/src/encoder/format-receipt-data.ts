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
	refunded: 'Refunded',
	net_total: 'Net Total',
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
 * `_display` variants. Source values are preserved verbatim — totals on
 * orders with partial refunds stay positive, and templates that want a
 * credit-note look render the `refunds[]` block explicitly.
 *
 * Returns a new object suitable for Mustache template rendering.
 */
export function formatReceiptData(data: ReceiptData): Record<string, any> {
	const currency = data.order.currency;
	if (!currency) {
		console.warn('formatReceiptData: missing currency in order, formatting may be incomplete');
	}
	const normalizedLocale = (data.presentation_hints?.locale || 'en-US').trim().replace(/_/g, '-');
	const displayTax = resolveDisplayValueSide(data);
	const i18n = {
		...DEFAULT_I18N,
		...data.i18n,
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
	const perUnit = (total: number | undefined, qty: number): number | undefined => {
		if (total == null || qty === 0) return undefined;
		return total / qty;
	};
	const pickDisplayValue = (
		total: number | undefined,
		totalIncl: number | undefined,
		totalExcl: number | undefined
	): number | undefined =>
		displayTax === 'excl' ? (totalExcl ?? total ?? totalIncl) : (totalIncl ?? total ?? totalExcl);
	const formatRefundTotal = <
		T extends {
			total: number;
			total_incl?: number;
			total_excl?: number;
			taxes?: { amount: number }[];
		},
	>(
		item: T
	) => ({
		...item,
		total_display: fmt(
			pickDisplayValue(item.total, item.total_incl, item.total_excl) ?? item.total
		),
		total_incl_display: item.total_incl != null ? fmt(item.total_incl) : undefined,
		total_excl_display: item.total_excl != null ? fmt(item.total_excl) : undefined,
		taxes: item.taxes?.map((tax) => ({
			...tax,
			amount_display: fmt(tax.amount),
		})),
	});
	const formatRefundLine = (line: NonNullable<ReceiptData['refunds']>[number]['lines'][number]) => {
		const lineTotal = line.line_total ?? line.total;
		const lineTotalIncl = line.line_total_incl ?? line.total_incl ?? line.total;
		const lineTotalExcl = line.line_total_excl ?? line.total_excl;
		const unitTotal = line.unit_total ?? perUnit(lineTotal, line.qty);
		const unitTotalIncl = line.unit_total_incl ?? perUnit(lineTotalIncl, line.qty);
		const unitTotalExcl = line.unit_total_excl ?? perUnit(lineTotalExcl, line.qty);
		const lineTotalDisplay = pickDisplayValue(lineTotal, lineTotalIncl, lineTotalExcl);
		const unitTotalDisplay = pickDisplayValue(unitTotal, unitTotalIncl, unitTotalExcl);

		return {
			...formatRefundTotal(line),
			line_total: lineTotal,
			line_total_incl: lineTotalIncl,
			line_total_excl: lineTotalExcl,
			line_total_display: fmt(lineTotalDisplay ?? lineTotal),
			line_total_incl_display: fmt(lineTotalIncl),
			line_total_excl_display: lineTotalExcl != null ? fmt(lineTotalExcl) : undefined,
			unit_total: unitTotal,
			unit_total_incl: unitTotalIncl,
			unit_total_excl: unitTotalExcl,
			unit_total_display: unitTotalDisplay != null ? fmt(unitTotalDisplay) : undefined,
			unit_total_incl_display: unitTotalIncl != null ? fmt(unitTotalIncl) : undefined,
			unit_total_excl_display: unitTotalExcl != null ? fmt(unitTotalExcl) : undefined,
		};
	};
	const discountTotalIncl = data.totals.discount_total_incl ?? data.totals.discount_total ?? 0;
	const discountTotalExcl = data.totals.discount_total_excl ?? data.totals.discount_total ?? 0;

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
		lines: data.lines.map((line) => ({
			...line,
			taxes: line.taxes.map((tax) => ({
				...tax,
				amount_display: fmt(tax.amount),
			})),
			unit_price_display: fmt(
				line.unit_price ?? (displayTax === 'excl' ? line.unit_price_excl : line.unit_price_incl)
			),
			unit_price_incl_display: fmt(line.unit_price_incl),
			unit_price_excl_display: fmt(line.unit_price_excl),
			line_subtotal_display: fmt(
				line.line_subtotal ??
					(displayTax === 'excl' ? line.line_subtotal_excl : line.line_subtotal_incl)
			),
			line_subtotal_incl_display: fmt(line.line_subtotal_incl),
			line_subtotal_excl_display: fmt(line.line_subtotal_excl),
			line_total_display: fmt(
				line.line_total ?? (displayTax === 'excl' ? line.line_total_excl : line.line_total_incl)
			),
			line_total_incl_display: fmt(line.line_total_incl),
			line_total_excl_display: fmt(line.line_total_excl),
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
				amount_display: fmt(tax.amount),
			})),
		})),
		shipping: data.shipping.map((s) => ({
			...s,
			total_display: fmt(s.total ?? (displayTax === 'excl' ? s.total_excl : s.total_incl)),
			total_incl_display: fmt(s.total_incl),
			total_excl_display: fmt(s.total_excl),
			taxes: s.taxes?.map((tax) => ({
				...tax,
				amount_display: fmt(tax.amount),
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
			subtotal_display: fmt(
				data.totals.subtotal ??
					(displayTax === 'excl' ? data.totals.subtotal_excl : data.totals.subtotal_incl)
			),
			subtotal_incl_display: fmt(data.totals.subtotal_incl),
			subtotal_excl_display: fmt(data.totals.subtotal_excl),
			discount_total_display: fmt(
				data.totals.discount_total ??
					(displayTax === 'excl' ? discountTotalExcl : discountTotalIncl)
			),
			discount_total_incl_display: fmt(discountTotalIncl),
			discount_total_excl_display: fmt(discountTotalExcl),
			tax_total_display: fmt(data.totals.tax_total),
			total_display: fmt(
				data.totals.total ??
					(displayTax === 'excl' ? data.totals.total_excl : data.totals.total_incl)
			),
			total_incl_display: fmt(data.totals.total_incl),
			total_excl_display: fmt(data.totals.total_excl),
			paid_total_display: fmt(data.totals.paid_total),
			change_total_display: fmt(data.totals.change_total),
			...(data.totals.refund_total != null
				? { refund_total_display: fmt(data.totals.refund_total) }
				: {}),
			...(data.totals.net_total != null ? { net_total_display: fmt(data.totals.net_total) } : {}),
		},
		tax_summary: data.tax_summary.map((tax) => ({
			...tax,
			tax_amount_display: fmt(tax.tax_amount),
			taxable_amount_incl_display:
				tax.taxable_amount_incl != null ? fmt(tax.taxable_amount_incl) : '',
			taxable_amount_excl_display:
				tax.taxable_amount_excl != null ? fmt(tax.taxable_amount_excl) : '',
		})),
		payments: data.payments.map((payment) => ({
			...payment,
			amount_display: fmt(payment.amount),
			tendered_display: payment.tendered != null ? fmt(payment.tendered) : undefined,
			change_display: payment.change != null ? fmt(payment.change) : undefined,
		})),
		refunds: data.refunds?.map((refund) => ({
			...refund,
			amount_display: fmt(refund.amount),
			subtotal_display: refund.subtotal != null ? fmt(refund.subtotal) : undefined,
			tax_total_display: refund.tax_total != null ? fmt(refund.tax_total) : undefined,
			shipping_total_display:
				refund.shipping_total != null ? fmt(refund.shipping_total) : undefined,
			shipping_tax_display: refund.shipping_tax != null ? fmt(refund.shipping_tax) : undefined,
			lines: refund.lines.map(formatRefundLine),
			fees: refund.fees?.map(formatRefundTotal),
			shipping: refund.shipping?.map(formatRefundTotal),
		})),
	};
}
