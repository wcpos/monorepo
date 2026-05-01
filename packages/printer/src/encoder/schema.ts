/**
 * Canonical receipt data Zod schema.
 *
 * Single source of truth for the ReceiptData contract. TypeScript types in
 * `./types.ts` are derived from these schemas via `z.infer<>`.
 *
 * Mirrors PHP `Receipt_Data_Builder` output and the `receipt_data` contract
 * used throughout the app.
 */

import * as z from 'zod';

/* ──────────────── Sub-schemas ──────────────── */

export const ReceiptStoreMetaSchema = z.object({
	name: z.string().describe('Store display name'),
	address_lines: z
		.array(z.string())
		.describe('Address as ordered lines (street, city, postcode...)'),
	tax_id: z.string().optional().describe('Store VAT/tax identifier'),
	phone: z.string().optional().describe('Store contact phone'),
	email: z.string().optional().describe('Store contact email'),
});

export const ReceiptOrderMetaSchema = z.object({
	schema_version: z.number().int().describe('Receipt-data contract version'),
	mode: z.string().describe('Receipt mode: sale, refund, quote, kitchen, etc.'),
	created_at_gmt: z.string().describe('Order creation timestamp (ISO/GMT)'),
	order_id: z.number().int().describe('Numeric order identifier'),
	order_number: z.string().describe('Human-facing order number'),
	currency: z.string().describe('ISO 4217 currency code (e.g. USD, EUR, AED)'),
});

export const ReceiptCashierSchema = z.object({
	id: z.number().int().describe('Cashier user ID (0 = unknown)'),
	name: z.string().describe('Cashier display name'),
});

export const ReceiptCustomerSchema = z.object({
	id: z.number().int().describe('Customer ID (0 = guest)'),
	name: z.string().describe('Customer display name'),
	billing_address: z.record(z.string(), z.string()).optional().describe('Billing address fields'),
	shipping_address: z.record(z.string(), z.string()).optional().describe('Shipping address fields'),
	tax_id: z.string().optional().describe('Customer VAT/tax identifier'),
});

export const ReceiptLineItemMetaSchema = z.object({
	key: z.string(),
	value: z.string(),
});

export const ReceiptLineItemTaxSchema = z.object({
	code: z.string().describe('Tax rate code'),
	amount: z.number().describe('Tax amount applied to this line'),
});

export const ReceiptLineItemSchema = z.object({
	key: z.string().describe('Stable line key (cart_item_key)'),
	sku: z.string().optional().describe('Product SKU'),
	name: z.string().describe('Product / line display name'),
	qty: z.number().describe('Quantity (negative for refund lines)'),
	unit_price: z.number().optional().describe('Display-side unit price'),
	unit_price_incl: z.number().describe('Unit price tax-inclusive'),
	unit_price_excl: z.number().describe('Unit price tax-exclusive'),
	line_subtotal: z.number().optional().describe('Display-side line subtotal'),
	line_subtotal_incl: z.number().describe('Line subtotal tax-inclusive'),
	line_subtotal_excl: z.number().describe('Line subtotal tax-exclusive'),
	discounts: z.number().optional().describe('Display-side discount on this line'),
	discounts_incl: z.number().describe('Line discount tax-inclusive'),
	discounts_excl: z.number().describe('Line discount tax-exclusive'),
	line_total: z.number().optional().describe('Display-side line total'),
	line_total_incl: z.number().describe('Line total tax-inclusive'),
	line_total_excl: z.number().describe('Line total tax-exclusive'),
	meta: z.array(ReceiptLineItemMetaSchema).optional().describe('Variation/meta key-value pairs'),
	taxes: z.array(ReceiptLineItemTaxSchema).describe('Per-rate tax breakdown'),
});

export const ReceiptFeeSchema = z.object({
	label: z.string().describe('Fee label'),
	total: z.number().optional().describe('Display-side fee total'),
	total_incl: z.number().describe('Fee total tax-inclusive'),
	total_excl: z.number().describe('Fee total tax-exclusive'),
});

export const ReceiptDiscountSchema = z.object({
	label: z.string().describe('Discount label / coupon code'),
	total: z.number().optional().describe('Display-side discount amount'),
	total_incl: z.number().describe('Discount total tax-inclusive'),
	total_excl: z.number().describe('Discount total tax-exclusive'),
});

export const ReceiptTotalsSchema = z.object({
	subtotal: z.number().optional().describe('Display-side subtotal'),
	subtotal_incl: z.number().describe('Subtotal tax-inclusive'),
	subtotal_excl: z.number().describe('Subtotal tax-exclusive'),
	discount_total: z.number().optional().describe('Display-side discount total'),
	discount_total_incl: z.number().describe('Discount total tax-inclusive'),
	discount_total_excl: z.number().describe('Discount total tax-exclusive'),
	tax_total: z.number().describe('Total tax amount'),
	grand_total: z.number().optional().describe('Display-side grand total'),
	grand_total_incl: z.number().describe('Grand total tax-inclusive'),
	grand_total_excl: z.number().describe('Grand total tax-exclusive'),
	paid_total: z.number().describe('Sum of payments tendered'),
	change_total: z.number().describe('Change returned to customer'),
});

export const ReceiptTaxSummaryItemSchema = z.object({
	code: z.string().describe('Tax rate code'),
	rate: z.number().describe('Tax rate as percentage'),
	label: z.string().describe('Tax rate display label'),
	taxable_amount_excl: z.number().describe('Net amount taxed (excl)'),
	tax_amount: z.number().describe('Tax amount collected'),
	taxable_amount_incl: z.number().describe('Gross amount taxed (incl)'),
});

export const ReceiptPaymentSchema = z.object({
	method_id: z.string().describe('Payment method identifier'),
	method_title: z.string().describe('Payment method display title'),
	amount: z.number().describe('Amount applied to order'),
	reference: z.string().optional().describe('Payment reference / txn id / last-4'),
	tendered: z.number().optional().describe('Amount tendered (cash)'),
	change: z.number().optional().describe('Change returned (cash)'),
});

export const ReceiptFiscalSchema = z.object({
	immutable_id: z.string().optional().describe('Fiscal immutable identifier'),
	receipt_number: z.string().optional().describe('Fiscal receipt number'),
	sequence: z.number().int().optional().describe('Fiscal sequence number'),
	hash: z.string().optional().describe('Fiscal hash signature'),
	qr_payload: z.string().optional().describe('Fiscal QR code payload'),
	tax_agency_code: z.string().optional().describe('Tax agency / authority code'),
	signed_at: z.string().optional().describe('Fiscal signing timestamp'),
});

export const ReceiptDisplayTaxSchema = z.enum(['incl', 'excl', 'hidden']);

export const ReceiptPresentationHintsSchema = z.object({
	display_tax: ReceiptDisplayTaxSchema.describe('Show prices including / excluding / no tax'),
	prices_entered_with_tax: z.boolean().describe('Whether store prices were entered tax-inclusive'),
	rounding_mode: z.string().describe('Rounding strategy: per-line | per-total'),
	locale: z.string().describe('Locale tag for formatting (e.g. en_US, ar_SA)'),
});

/* ──────────────── Top-level schema ──────────────── */

export const ReceiptDataSchema = z.object({
	meta: ReceiptOrderMetaSchema,
	store: ReceiptStoreMetaSchema,
	cashier: ReceiptCashierSchema,
	customer: ReceiptCustomerSchema,
	lines: z.array(ReceiptLineItemSchema),
	fees: z.array(ReceiptFeeSchema),
	shipping: z.array(ReceiptFeeSchema),
	discounts: z.array(ReceiptDiscountSchema),
	totals: ReceiptTotalsSchema,
	tax_summary: z.array(ReceiptTaxSummaryItemSchema),
	payments: z.array(ReceiptPaymentSchema),
	fiscal: ReceiptFiscalSchema,
	presentation_hints: ReceiptPresentationHintsSchema,
});

/* ──────────────── Derived TypeScript types ──────────────── */

export type ReceiptStoreMeta = z.infer<typeof ReceiptStoreMetaSchema>;
export type ReceiptOrderMeta = z.infer<typeof ReceiptOrderMetaSchema>;
export type ReceiptCashier = z.infer<typeof ReceiptCashierSchema>;
export type ReceiptCustomer = z.infer<typeof ReceiptCustomerSchema>;
export type ReceiptLineItem = z.infer<typeof ReceiptLineItemSchema>;
export type ReceiptFee = z.infer<typeof ReceiptFeeSchema>;
export type ReceiptDiscount = z.infer<typeof ReceiptDiscountSchema>;
export type ReceiptTotals = z.infer<typeof ReceiptTotalsSchema>;
export type ReceiptTaxSummaryItem = z.infer<typeof ReceiptTaxSummaryItemSchema>;
export type ReceiptPayment = z.infer<typeof ReceiptPaymentSchema>;
export type ReceiptFiscal = z.infer<typeof ReceiptFiscalSchema>;
export type ReceiptPresentationHints = z.infer<typeof ReceiptPresentationHintsSchema>;
export type ReceiptData = z.infer<typeof ReceiptDataSchema>;
