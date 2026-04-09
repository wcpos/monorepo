/**
 * Canonical receipt data shape.
 * Matches the PHP Receipt_Data_Builder output and the
 * receipt_data contract used throughout the app.
 */

export interface ReceiptStoreMeta {
	name: string;
	address_lines: string[];
	tax_id?: string;
	phone?: string;
	email?: string;
}

export interface ReceiptOrderMeta {
	schema_version: number;
	mode: string;
	created_at_gmt: string;
	order_id: number;
	order_number: string;
	currency: string;
}

export interface ReceiptCashier {
	id: number;
	name: string;
}

export interface ReceiptCustomer {
	id: number;
	name: string;
	billing_address?: Record<string, string>;
	shipping_address?: Record<string, string>;
	tax_id?: string;
}

export interface ReceiptLineItem {
	key: string;
	sku?: string;
	name: string;
	qty: number;
	unit_price?: number;
	unit_price_incl: number;
	unit_price_excl: number;
	line_subtotal?: number;
	line_subtotal_incl: number;
	line_subtotal_excl: number;
	discounts?: number;
	discounts_incl: number;
	discounts_excl: number;
	line_total?: number;
	line_total_incl: number;
	line_total_excl: number;
	meta?: { key: string; value: string }[];
	taxes: { code: string; amount: number }[];
}

export interface ReceiptFee {
	label: string;
	total?: number;
	total_incl: number;
	total_excl: number;
}

export interface ReceiptDiscount {
	label: string;
	total?: number;
	total_incl: number;
	total_excl: number;
}

export interface ReceiptTotals {
	subtotal?: number;
	subtotal_incl: number;
	subtotal_excl: number;
	discount_total?: number;
	discount_total_incl: number;
	discount_total_excl: number;
	tax_total: number;
	grand_total?: number;
	grand_total_incl: number;
	grand_total_excl: number;
	paid_total: number;
	change_total: number;
}

export interface ReceiptTaxSummaryItem {
	code: string;
	rate: number;
	label: string;
	taxable_amount_excl: number;
	tax_amount: number;
	taxable_amount_incl: number;
}

export interface ReceiptPayment {
	method_id: string;
	method_title: string;
	amount: number;
	reference?: string;
	tendered?: number;
	change?: number;
}

export interface ReceiptFiscal {
	immutable_id?: string;
	receipt_number?: string;
	sequence?: number;
	hash?: string;
	qr_payload?: string;
	tax_agency_code?: string;
	signed_at?: string;
}

export interface ReceiptPresentationHints {
	display_tax: 'incl' | 'excl' | 'hidden';
	prices_entered_with_tax: boolean;
	rounding_mode: string;
	locale: string;
}

export interface ReceiptData {
	meta: ReceiptOrderMeta;
	store: ReceiptStoreMeta;
	cashier: ReceiptCashier;
	customer: ReceiptCustomer;
	lines: ReceiptLineItem[];
	fees: ReceiptFee[];
	shipping: ReceiptFee[];
	discounts: ReceiptDiscount[];
	totals: ReceiptTotals;
	tax_summary: ReceiptTaxSummaryItem[];
	payments: ReceiptPayment[];
	fiscal: ReceiptFiscal;
	presentation_hints: ReceiptPresentationHints;
}
