import { encodeThermalTemplate } from '../renderer';
import { DEFAULT_THERMAL_TEMPLATE } from './default-thermal-template';
import { formatEscposMoney } from './format-money';

import type { ReceiptData } from './types';
import type { DrawerConnector } from '../types';

export interface EncodeReceiptOptions {
	/** Printer model key from receipt-printer-encoder's database */
	printerModel?: string;
	/** Printer command language */
	language?: 'esc-pos' | 'star-prnt' | 'star-line';
	/** Characters per line. 48 = 80mm, 32 = 58mm */
	columns?: number;
	/** Enable CP932/Kanji-mode encoding for Japanese ESC/POS receipts. Default: false */
	enableCp932?: boolean;
	/**
	 * Emit `ESC !` print-mode bytes alongside `GS !` size bytes.
	 * Default: true. Disable as an escape hatch for printers that misbehave.
	 */
	emitEscPrintMode?: boolean;
	/** Include cut command. Default: true */
	cut?: boolean;
	/** Send cash drawer kick pulse. Default: false */
	openDrawer?: boolean;
	/** Cash-drawer connector used when openDrawer is true. Default: pin2 */
	drawerConnector?: DrawerConnector;
	/** Decimal places for monetary formatting. Default: 2 */
	decimals?: number;
}

export function encodeReceipt(data: ReceiptData, options: EncodeReceiptOptions = {}): Uint8Array {
	const {
		printerModel,
		language = 'esc-pos',
		columns = 48,
		enableCp932 = false,
		emitEscPrintMode = true,
		cut = true,
		openDrawer = false,
		drawerConnector = 'pin2',
		decimals: dp,
	} = options;

	const currency = data.order.currency;
	const locale = data.presentation_hints?.locale;
	const fmt = (value: number, decimals?: number): string =>
		formatEscposMoney(value, currency, locale, decimals, language);

	// Compute column widths
	const infoColRight = Math.max(12, Math.floor(columns / 2));
	const infoColLeft = columns - infoColRight;
	const priceColWidth = Math.max(10, Math.floor(columns * 0.25));
	const nameColWidth = columns - priceColWidth;
	const customerTaxId = data.customer?.tax_ids?.[0]?.value || '';
	const discountTotalIncl = data.totals.discount_total_incl ?? data.totals.discount_total ?? 0;
	// Strictly the inclusive value: total_saved (display basis) may be exclusive,
	// and null means the inclusive figure is unknowable — omit the row, never guess.
	const totalSavedIncl =
		typeof data.totals.total_saved_incl === 'number' ? data.totals.total_saved_incl : null;

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
			detail: `  x${item.qty} @ ${fmt(item.unit_price_incl, dp)}`,
			line_total_fmt: fmt(item.line_total_incl, dp),
			nameColWidth,
			priceColWidth,
		})),
		subtotal_fmt: fmt(data.totals.subtotal_incl, dp),
		has_discount: discountTotalIncl > 0,
		discount_fmt: `-${fmt(discountTotalIncl, dp)}`,
		show_tax: data.presentation_hints.display_tax !== 'hidden' && data.totals.tax_total > 0,
		tax_lines: data.tax_summary.map((tax) => ({
			label: tax.rate ? `${tax.label} (${tax.rate}%)` : tax.label,
			amount_fmt: fmt(tax.tax_amount, dp),
			nameColWidth,
			priceColWidth,
		})),
		total_fmt: fmt(data.totals.total_incl, dp),
		has_total_saved:
			data.totals.total_saved_complete === true && totalSavedIncl !== null && totalSavedIncl > 0,
		total_saved_fmt: fmt(totalSavedIncl ?? 0, dp),
		payments: data.payments.map((payment) => ({
			method_title: payment.method_title,
			amount_fmt: fmt(payment.amount, dp),
			has_tendered: !!(payment.tendered && payment.tendered > 0),
			tendered_fmt: fmt(payment.tendered ?? 0, dp),
			change_fmt: fmt(payment.change ?? 0, dp),
			nameColWidth,
			priceColWidth,
		})),
	};

	return encodeThermalTemplate(DEFAULT_THERMAL_TEMPLATE, templateData, {
		printerModel,
		language,
		columns,
		enableCp932,
		emitEscPrintMode,
		drawerConnector,
	});
}
