import { encodeThermalTemplate } from '../renderer';
import { DEFAULT_THERMAL_TEMPLATE } from './default-thermal-template';

import type { ReceiptData } from './types';

export interface EncodeReceiptOptions {
	/** Printer model key from receipt-printer-encoder's database */
	printerModel?: string;
	/** Printer command language */
	language?: 'esc-pos' | 'star-prnt' | 'star-line';
	/** Characters per line. 48 = 80mm, 32 = 58mm */
	columns?: number;
	/** Enable CP932/Kanji-mode encoding for Japanese ESC/POS receipts. Default: false */
	enableCp932?: boolean;
	/** Include cut command. Default: true */
	cut?: boolean;
	/** Send cash drawer kick pulse. Default: false */
	openDrawer?: boolean;
	/** Decimal places for monetary formatting. Default: 2 */
	decimals?: number;
}

function formatMoney(value: number, currency: string, dp: number = 2): string {
	return `${currency} ${value.toFixed(dp)}`;
}

export function encodeReceipt(data: ReceiptData, options: EncodeReceiptOptions = {}): Uint8Array {
	const {
		printerModel,
		language = 'esc-pos',
		columns = 48,
		enableCp932 = false,
		cut = true,
		openDrawer = false,
		decimals: dp = 2,
	} = options;

	const currency = data.order.currency;

	// Compute column widths
	const infoColRight = Math.max(12, Math.floor(columns / 2));
	const infoColLeft = columns - infoColRight;
	const priceColWidth = Math.max(10, Math.floor(columns * 0.25));
	const nameColWidth = columns - priceColWidth;
	const customerTaxId = data.customer?.tax_ids?.[0]?.value || '';
	const discountTotalIncl = data.totals.discount_total_incl ?? data.totals.discount_total ?? 0;

	// Build template data with pre-formatted money values
	const templateData: Record<string, any> = {
		...data,
		columns,
		cut,
		openDrawer,
		infoColLeft,
		infoColRight,
		nameColWidth,
		priceColWidth,
		order_number: data.order.number,
		created_at_gmt: data.order.created.datetime,
		has_address_lines: data.store.address_lines && data.store.address_lines.length > 0,
		address_lines: (data.store.address_lines ?? []).map((line) => ({ line })),
		has_phone: !!data.store.phone,
		store_tax_ids: (data.store?.tax_ids ?? []).map((t) => ({
			type: t.type,
			value: t.value,
			country: t.country ?? '',
			label: t.label ?? 'Tax ID',
		})),
		has_store_tax_ids: !!(data.store?.tax_ids && data.store.tax_ids.length > 0),
		cashier_name: data.cashier?.name || '',
		customer_name: data.customer?.name || '',
		customer_tax_id: customerTaxId,
		has_customer_tax_id: !!customerTaxId,
		customer_tax_ids: (data.customer?.tax_ids ?? []).map((t) => ({
			type: t.type,
			value: t.value,
			country: t.country ?? '',
			label: t.label ?? '',
		})),
		has_customer_tax_ids: !!(data.customer?.tax_ids && data.customer.tax_ids.length > 0),
		formatted_lines: data.lines.map((item) => ({
			name: item.name,
			detail: `  x${item.qty} @ ${formatMoney(item.unit_price_incl, currency, dp)}`,
			line_total_fmt: formatMoney(item.line_total_incl, currency, dp),
			nameColWidth,
			priceColWidth,
		})),
		subtotal_fmt: formatMoney(data.totals.subtotal_incl, currency, dp),
		has_discount: discountTotalIncl > 0,
		discount_fmt: `-${formatMoney(discountTotalIncl, currency, dp)}`,
		show_tax: data.presentation_hints.display_tax !== 'hidden' && data.totals.tax_total > 0,
		tax_lines: data.tax_summary.map((tax) => ({
			label: tax.rate ? `${tax.label} (${tax.rate}%)` : tax.label,
			amount_fmt: formatMoney(tax.tax_amount, currency, dp),
			nameColWidth,
			priceColWidth,
		})),
		total_fmt: formatMoney(data.totals.total_incl, currency, dp),
		payments: data.payments.map((payment) => ({
			method_title: payment.method_title,
			amount_fmt: formatMoney(payment.amount, currency, dp),
			has_tendered: !!(payment.tendered && payment.tendered > 0),
			tendered_fmt: formatMoney(payment.tendered ?? 0, currency, dp),
			change_fmt: formatMoney(payment.change ?? 0, currency, dp),
			nameColWidth,
			priceColWidth,
		})),
	};

	return encodeThermalTemplate(DEFAULT_THERMAL_TEMPLATE, templateData, {
		printerModel,
		language,
		columns,
		enableCp932,
	});
}
