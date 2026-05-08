/**
 * Canonical receipt data Zod schema.
 *
 * Single source of truth for the ReceiptData contract. TypeScript types in
 * `./types.ts` are derived from these schemas via `z.infer<>`.
 *
 * Mirrors PHP `Receipt_Data_Builder` output (see
 * `woocommerce-pos/includes/Services/Receipt_Data_Builder.php`) and the
 * `receipt_data` contract used throughout the app.
 */

import * as z from 'zod';

/* ──────────────── Sub-schemas ──────────────── */

/**
 * Multi-format date object produced by PHP `Receipt_Date_Formatter`. Every
 * field is always present; values are empty strings when the source date is
 * null. Templates pick whichever variant they need.
 */
export const ReceiptDateSchema = z.object({
	datetime: z.string(),
	date: z.string(),
	time: z.string(),
	datetime_short: z.string(),
	datetime_long: z.string(),
	datetime_full: z.string(),
	date_short: z.string(),
	date_long: z.string(),
	date_full: z.string(),
	date_ymd: z.string(),
	date_dmy: z.string(),
	date_mdy: z.string(),
	weekday_short: z.string(),
	weekday_long: z.string(),
	day: z.string(),
	month: z.string(),
	month_short: z.string(),
	month_long: z.string(),
	year: z.string(),
});

export const ReceiptOrderSchema = z.object({
	id: z.number().int().describe('Numeric order ID'),
	number: z.string().describe('Human-facing order number'),
	currency: z.string().describe('Order currency code'),
	customer_note: z.string().describe('Free-text note attached to the order'),
	wc_status: z
		.string()
		.optional()
		.describe('Raw WooCommerce order status (e.g. processing, completed)'),
	status_label: z
		.string()
		.optional()
		.describe(
			'Localized order status name (e.g. "Completed", "Terminé"). Sourced from wc_get_order_status_name() and includes labels for custom statuses registered by extensions. Use this in templates for display; use wc_status for conditional / styling logic.'
		),
	created_via: z
		.string()
		.optional()
		.describe('Order source / channel (e.g. woocommerce-pos, checkout, admin)'),
	created: ReceiptDateSchema,
	paid: ReceiptDateSchema,
	completed: ReceiptDateSchema,
	printed: ReceiptDateSchema.describe(
		'Render-time print timestamp. Refreshed on every Receipt_Data_Builder::build() call so reprints reflect the actual print time rather than persisted order metadata.'
	),
});

export const TaxIdSchema = z.object({
	type: z
		.string()
		.describe('Tax ID type (e.g. "eu_vat", "de_steuernummer", "au_abn"; "other" for unknown)'),
	value: z.string().describe('Tax ID value as displayed'),
	country: z.string().optional().describe('ISO-3166 alpha-2 country code'),
	label: z.string().optional().describe('Optional display label override'),
});
export type TaxId = z.infer<typeof TaxIdSchema>;

/**
 * Structured store address. Mirrors the part-by-part shape WooCommerce
 * stores natively (`get_store_address`, `get_store_city`, etc.) so
 * templates can compose country-specific layouts directly. Sits
 * alongside the pre-formatted `address_lines[]`, which remains the
 * easy default for templates that just iterate.
 *
 * All fields optional — stores in the wild often omit `address_2`,
 * `state`, or both.
 */
export const ReceiptStoreAddressSchema = z.object({
	address_1: z.string().optional().describe('Street address line 1'),
	address_2: z.string().optional().describe('Street address line 2 / suite / unit'),
	city: z.string().optional().describe('City / locality'),
	state: z.string().optional().describe('State / region / province'),
	postcode: z.string().optional().describe('Postal / ZIP code'),
	country: z.string().optional().describe('ISO 3166-1 alpha-2 country code'),
});

export const ReceiptStoreMetaSchema = z.object({
	id: z.number().int().describe('Store ID'),
	name: z.string().describe('Store display name'),
	address: ReceiptStoreAddressSchema.optional().describe(
		'Structured address parts. Use these to compose custom / country-specific layouts; address_lines[] is the pre-formatted default.'
	),
	address_lines: z
		.array(z.string())
		.describe('Address as ordered lines (street, city, postcode...)'),
	tax_ids: z.array(TaxIdSchema).optional().describe('Structured business identifiers'),
	phone: z.string().optional().describe('Store contact phone'),
	email: z.string().optional().describe('Store contact email'),
	logo: z.string().nullable().optional().describe('Store logo (URL or data URI)'),
	opening_hours: z.string().nullable().optional().describe('Compact opening hours summary'),
	opening_hours_vertical: z
		.string()
		.nullable()
		.optional()
		.describe('Multi-line opening hours block'),
	opening_hours_inline: z
		.string()
		.nullable()
		.optional()
		.describe('Inline opening hours (comma-separated)'),
	opening_hours_notes: z.string().nullable().optional().describe('Free-text notes about hours'),
	personal_notes: z
		.string()
		.nullable()
		.optional()
		.describe('Personal notes printed on the receipt'),
	policies_and_conditions: z
		.string()
		.nullable()
		.optional()
		.describe('Refund / exchange policy text'),
	footer_imprint: z.string().nullable().optional().describe('Footer imprint / legal block'),
});

export const ReceiptCashierSchema = z.object({
	id: z.number().int().describe('Cashier user ID (0 = unknown)'),
	name: z.string().describe('Cashier display name'),
});

/**
 * Structured customer tax ID. Mirrors the canonical PHP `TaxId` shape (see
 * `Tax_Id_Reader::parse_meta_map`).
 */
export const ReceiptTaxIdSchema = z.object({
	type: z
		.enum([
			'eu_vat',
			'gb_vat',
			'au_abn',
			'br_cpf',
			'br_cnpj',
			'in_gst',
			'it_cf',
			'it_piva',
			'es_nif',
			'ar_cuit',
			'sa_vat',
			'ca_gst_hst',
			'us_ein',
			'de_ust_id',
			'de_steuernummer',
			'de_hrb',
			'nl_kvk',
			'fr_siret',
			'fr_siren',
			'gb_company',
			'ch_uid',
			'other',
		])
		.describe('Tax ID type identifier'),
	value: z.string().describe('Normalised tax ID value'),
	country: z.string().nullable().optional().describe('ISO 3166-1 alpha-2 country code, when known'),
	label: z.string().nullable().optional().describe('Optional human-readable label'),
});

export const ReceiptCustomerSchema = z.object({
	id: z.number().int().nullable().describe('Customer ID (null/0 = guest)'),
	name: z.string().describe('Customer display name'),
	billing_address: z.record(z.string(), z.string()).optional().describe('Billing address fields'),
	shipping_address: z.record(z.string(), z.string()).optional().describe('Shipping address fields'),
	tax_ids: z
		.array(ReceiptTaxIdSchema)
		.optional()
		.describe('Structured customer tax IDs (TaxId[]). Snapshotted from the order at sale time.'),
});

export const ReceiptLineItemMetaSchema = z.object({
	key: z.string(),
	value: z.string(),
});

export const ReceiptLineItemTaxSchema = z.object({
	code: z.string().describe('Tax rate code'),
	rate: z.number().nullable().optional().describe('Tax rate percentage (nullable when unresolved)'),
	label: z.string().optional().describe('Human-readable tax label (e.g. "VAT 20%")'),
	compound: z.boolean().optional().describe('Whether this tax is compounded on top of others'),
	amount: z.number().describe('Tax amount applied to this line'),
});

export const ReceiptLineItemSchema = z.object({
	key: z.string().describe('Stable line key (cart_item_key)'),
	sku: z.string().optional().describe('Product SKU'),
	name: z.string().describe('Product / line display name'),
	qty: z.number().describe('Quantity (negative for refund lines)'),
	qty_refunded: z.number().optional().describe('Quantity refunded (positive number)'),
	unit_subtotal: z.number().optional().describe('Display-side per-unit subtotal (pre-discount)'),
	unit_subtotal_incl: z.number().optional().describe('Per-unit subtotal tax-inclusive'),
	unit_subtotal_excl: z.number().optional().describe('Per-unit subtotal tax-exclusive'),
	unit_price: z.number().optional().describe('Display-side unit price (post-discount)'),
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
	total_refunded: z.number().optional().describe('Total amount refunded for this line (positive)'),
	meta: z.array(ReceiptLineItemMetaSchema).optional().describe('Variation/meta key-value pairs'),
	taxes: z.array(ReceiptLineItemTaxSchema).describe('Per-rate tax breakdown'),
});

/**
 * Fees and shipping share the same shape (PHP emits both via the same builder).
 * `meta` and `taxes` mirror the line-item shapes so templates can show
 * shipping tracking codes, fee notes, or per-fee/shipping itemized tax. Both
 * are optional — the live PHP builder doesn't emit them yet.
 */
export const ReceiptFeeSchema = z.object({
	label: z.string().describe('Fee label'),
	total: z.number().optional().describe('Display-side fee total'),
	total_incl: z.number().describe('Fee total tax-inclusive'),
	total_excl: z.number().describe('Fee total tax-exclusive'),
	meta: z
		.array(ReceiptLineItemMetaSchema)
		.optional()
		.describe('Fee meta key-value pairs (notes, etc.)'),
	taxes: z
		.array(ReceiptLineItemTaxSchema)
		.optional()
		.describe('Per-rate tax breakdown for this fee'),
});

export const ReceiptShippingSchema = z.object({
	label: z.string().describe('Shipping line label / method title'),
	method_id: z.string().optional().describe('Shipping method id (e.g. flat_rate, free_shipping)'),
	total: z.number().optional().describe('Display-side shipping total'),
	total_incl: z.number().describe('Shipping total tax-inclusive'),
	total_excl: z.number().describe('Shipping total tax-exclusive'),
	meta: z
		.array(ReceiptLineItemMetaSchema)
		.optional()
		.describe('Shipping meta key-value pairs (tracking codes, notes, etc.)'),
	taxes: z
		.array(ReceiptLineItemTaxSchema)
		.optional()
		.describe('Per-rate tax breakdown for this shipping line'),
});

export const ReceiptDiscountSchema = z.object({
	label: z.string().describe('Discount label / coupon code'),
	code: z.string().optional().describe('Coupon code for this row (single code per row)'),
	codes: z.string().optional().describe('Joined coupon codes (legacy / display fallback)'),
	total: z
		.number()
		.nonnegative()
		.optional()
		.describe(
			'Display-side discount amount as a positive magnitude; templates may prepend "-" for display'
		),
	total_incl: z
		.number()
		.nonnegative()
		.describe(
			'Discount total tax-inclusive as a positive magnitude; templates may prepend "-" for display'
		),
	total_excl: z
		.number()
		.nonnegative()
		.describe(
			'Discount total tax-exclusive as a positive magnitude; templates may prepend "-" for display'
		),
});

export const ReceiptTotalsSchema = z.object({
	subtotal: z.number().optional().describe('Display-side subtotal'),
	subtotal_incl: z.number().describe('Subtotal tax-inclusive'),
	subtotal_excl: z.number().describe('Subtotal tax-exclusive'),
	discount_total: z
		.number()
		.nonnegative()
		.optional()
		.describe(
			'Display-side discount total as a positive magnitude; templates may prepend "-" for display'
		),
	discount_total_incl: z
		.number()
		.nonnegative()
		.optional()
		.describe(
			'Discount total tax-inclusive as a positive magnitude; templates may prepend "-" for display'
		),
	discount_total_excl: z
		.number()
		.nonnegative()
		.optional()
		.describe(
			'Discount total tax-exclusive as a positive magnitude; templates may prepend "-" for display'
		),
	tax_total: z.number().describe('Total tax amount'),
	total: z.number().optional().describe('Display-side grand total'),
	total_incl: z.number().describe('Grand total tax-inclusive'),
	total_excl: z.number().describe('Grand total tax-exclusive'),
	paid_total: z.number().describe('Sum of payments tendered'),
	change_total: z.number().describe('Change returned to customer'),
	refund_total: z
		.number()
		.optional()
		.describe('Total amount refunded across all refunds (positive)'),
	net_total: z
		.number()
		.optional()
		.describe(
			'Order grand total minus refund_total, clamped to >= 0 (positive). Present when refund_total is set.'
		),
});

export const ReceiptTaxSummaryItemSchema = z.object({
	code: z.string().describe('Tax rate code'),
	rate: z.number().nullable().describe('Tax rate as percentage (null when unresolved)'),
	label: z.string().describe('Tax rate display label'),
	compound: z.boolean().optional().describe('Whether this tax is compounded on top of others'),
	taxable_amount_excl: z.number().nullable().describe('Net amount taxed (excl)'),
	tax_amount: z.number().describe('Tax amount collected'),
	taxable_amount_incl: z.number().nullable().describe('Gross amount taxed (incl)'),
});

export const ReceiptPaymentSchema = z.object({
	method_id: z.string().describe('Payment method identifier'),
	method_title: z.string().describe('Payment method display title'),
	amount: z.number().describe('Amount applied to order'),
	transaction_id: z
		.string()
		.optional()
		.describe('Gateway transaction ID (matches WC order get_transaction_id)'),
	tendered: z.number().optional().describe('Amount tendered (cash)'),
	change: z.number().optional().describe('Change returned (cash)'),
});

export const ReceiptRefundLineSchema = z.object({
	name: z.string().describe('Refunded line item name'),
	sku: z.string().optional().describe('Refunded line item SKU'),
	qty: z.number().describe('Quantity refunded (positive)'),
	total: z.number().describe('Refunded amount for this line (positive)'),
	total_incl: z.number().optional().describe('Refunded line total tax-inclusive (positive)'),
	total_excl: z.number().optional().describe('Refunded line total tax-exclusive (positive)'),
	line_total: z
		.number()
		.optional()
		.describe('Alias of total for line-item template parity (positive)'),
	line_total_incl: z
		.number()
		.optional()
		.describe('Alias of total_incl for line-item template parity (positive)'),
	line_total_excl: z
		.number()
		.optional()
		.describe('Alias of total_excl for line-item template parity (positive)'),
	unit_total: z
		.number()
		.optional()
		.describe('Refunded amount per unit for this line (positive, derived when qty > 0)'),
	unit_total_incl: z
		.number()
		.optional()
		.describe('Refunded tax-inclusive amount per unit (positive, derived when qty > 0)'),
	unit_total_excl: z
		.number()
		.optional()
		.describe('Refunded tax-exclusive amount per unit (positive, derived when qty > 0)'),
	taxes: z
		.array(ReceiptLineItemTaxSchema)
		.optional()
		.describe('Per-rate tax breakdown for this refunded line'),
});

export const ReceiptRefundFeeSchema = z.object({
	label: z.string().describe('Refunded fee label'),
	total: z.number().describe('Refunded fee amount (positive)'),
	total_incl: z.number().optional().describe('Refunded fee total tax-inclusive (positive)'),
	total_excl: z.number().optional().describe('Refunded fee total tax-exclusive (positive)'),
	taxes: z
		.array(ReceiptLineItemTaxSchema)
		.optional()
		.describe('Per-rate tax breakdown for this refunded fee'),
});

export const ReceiptRefundShippingSchema = z.object({
	label: z.string().describe('Refunded shipping label'),
	method_id: z.string().optional().describe('Shipping method id'),
	total: z.number().describe('Refunded shipping amount (positive)'),
	total_incl: z.number().optional().describe('Refunded shipping total tax-inclusive (positive)'),
	total_excl: z.number().optional().describe('Refunded shipping total tax-exclusive (positive)'),
	taxes: z
		.array(ReceiptLineItemTaxSchema)
		.optional()
		.describe('Per-rate tax breakdown for this refunded shipping line'),
});

export const ReceiptRefundSchema = z.object({
	id: z.number().int().describe('Refund record ID'),
	date: ReceiptDateSchema.optional().describe('When the refund was created'),
	amount: z.number().describe('Refund total (positive)'),
	subtotal: z.number().optional().describe('Refund subtotal across line items (positive)'),
	tax_total: z.number().optional().describe('Total tax refunded across all items (positive)'),
	shipping_total: z.number().optional().describe('Shipping amount refunded (positive)'),
	shipping_tax: z.number().optional().describe('Shipping tax refunded (positive)'),
	reason: z.string().optional().describe('Refund reason'),
	refunded_by_id: z.number().int().nullable().optional().describe('User who issued the refund'),
	refunded_by_name: z.string().optional().describe('Display name of user who issued the refund'),
	refunded_payment: z
		.boolean()
		.optional()
		.describe('Whether the gateway payment was also refunded'),
	destination: z
		.string()
		.optional()
		.describe('Where the refund was sent (original_method | cash | manual)'),
	gateway_id: z.string().optional().describe('Payment gateway id used for the refund'),
	gateway_title: z.string().optional().describe('Payment gateway display title'),
	processing_mode: z
		.string()
		.optional()
		.describe('How the refund was processed (provider | manual)'),
	lines: z.array(ReceiptRefundLineSchema).describe('Line items included in this refund'),
	fees: z.array(ReceiptRefundFeeSchema).optional().describe('Fees included in this refund'),
	shipping: z
		.array(ReceiptRefundShippingSchema)
		.optional()
		.describe('Shipping rows included in this refund'),
});

export const ReceiptFiscalSchema = z.object({
	immutable_id: z.string().optional().describe('Fiscal immutable identifier'),
	receipt_number: z.string().optional().describe('Fiscal receipt number'),
	sequence: z.number().int().nullable().optional().describe('Fiscal sequence number'),
	hash: z.string().optional().describe('Fiscal hash signature'),
	qr_payload: z.string().optional().describe('Fiscal QR code payload'),
	tax_agency_code: z.string().optional().describe('Tax agency / authority code'),
	signed_at: z.string().optional().describe('Fiscal signing timestamp'),
	signature_excerpt: z
		.string()
		.optional()
		.describe('Truncated signature for human-readable display'),
	document_label: z.string().optional().describe('Document label (e.g. "Tax Invoice")'),
	is_reprint: z.boolean().optional().describe('True if this is a reprint of an existing receipt'),
	reprint_count: z
		.number()
		.int()
		.optional()
		.describe('How many times this receipt has been reprinted'),
	extra_fields: z
		.union([z.array(z.unknown()), z.record(z.string(), z.unknown())])
		.optional()
		.describe('Jurisdiction-specific extra fields'),
});

export const ReceiptDisplayTaxSchema = z.enum(['incl', 'excl', 'hidden', 'itemized', 'single']);

export const ReceiptPresentationHintsSchema = z.object({
	display_tax: ReceiptDisplayTaxSchema.describe(
		'Tax display mode: incl/excl drive price formatting; itemized/single mirror WC option'
	),
	prices_entered_with_tax: z.boolean().describe('Whether store prices were entered tax-inclusive'),
	rounding_mode: z.string().describe('Rounding strategy: per-line | per-total | yes | no'),
	locale: z.string().describe('Locale tag for formatting (e.g. en_US, ar_SA)'),
	order_barcode_type: z
		.enum(['code128', 'qrcode', 'ean13', 'ean8', 'upca'])
		.optional()
		.describe('Barcode symbology used by gallery templates for the order number'),
});

/**
 * The i18n label dictionary mirrors `Receipt_I18n_Labels::get_labels()`. Keys
 * are stable IDs (not free-form). Listed here so designers see what's
 * available; extra keys are allowed because plugins/extensions may add more.
 */
export const ReceiptI18nSchema = z
	.object({
		order: z.string().optional(),
		date: z.string().optional(),
		invoice_no: z.string().optional(),
		reference: z.string().optional(),
		cashier: z.string().optional(),
		customer: z.string().optional(),
		customer_tax_id: z.string().optional(),
		customer_tax_ids: z.string().optional(),
		tax_id_eu_vat: z.string().optional(),
		tax_id_gb_vat: z.string().optional(),
		tax_id_sa_vat: z.string().optional(),
		tax_id_au_abn: z.string().optional(),
		tax_id_br_cpf: z.string().optional(),
		tax_id_br_cnpj: z.string().optional(),
		tax_id_in_gst: z.string().optional(),
		tax_id_it_cf: z.string().optional(),
		tax_id_it_piva: z.string().optional(),
		tax_id_es_nif: z.string().optional(),
		tax_id_ar_cuit: z.string().optional(),
		tax_id_ca_gst_hst: z.string().optional(),
		tax_id_us_ein: z.string().optional(),
		tax_id_other: z.string().optional(),
		store_tax_ids: z.string().optional(),
		store_tax_id_label_eu_vat: z.string().optional(),
		store_tax_id_label_gb_vat: z.string().optional(),
		store_tax_id_label_sa_vat: z.string().optional(),
		store_tax_id_label_au_abn: z.string().optional(),
		store_tax_id_label_br_cpf: z.string().optional(),
		store_tax_id_label_br_cnpj: z.string().optional(),
		store_tax_id_label_in_gst: z.string().optional(),
		store_tax_id_label_it_cf: z.string().optional(),
		store_tax_id_label_it_piva: z.string().optional(),
		store_tax_id_label_es_nif: z.string().optional(),
		store_tax_id_label_ar_cuit: z.string().optional(),
		store_tax_id_label_ca_gst_hst: z.string().optional(),
		store_tax_id_label_us_ein: z.string().optional(),
		store_tax_id_label_de_ust_id: z.string().optional(),
		store_tax_id_label_de_steuernummer: z.string().optional(),
		store_tax_id_label_de_hrb: z.string().optional(),
		store_tax_id_label_nl_kvk: z.string().optional(),
		store_tax_id_label_fr_siret: z.string().optional(),
		store_tax_id_label_fr_siren: z.string().optional(),
		store_tax_id_label_gb_company: z.string().optional(),
		store_tax_id_label_ch_uid: z.string().optional(),
		store_tax_id_label_other: z.string().optional(),
		customer_tax_id_label_eu_vat: z.string().optional(),
		customer_tax_id_label_gb_vat: z.string().optional(),
		customer_tax_id_label_sa_vat: z.string().optional(),
		customer_tax_id_label_au_abn: z.string().optional(),
		customer_tax_id_label_br_cpf: z.string().optional(),
		customer_tax_id_label_br_cnpj: z.string().optional(),
		customer_tax_id_label_in_gst: z.string().optional(),
		customer_tax_id_label_it_cf: z.string().optional(),
		customer_tax_id_label_it_piva: z.string().optional(),
		customer_tax_id_label_es_nif: z.string().optional(),
		customer_tax_id_label_ar_cuit: z.string().optional(),
		customer_tax_id_label_ca_gst_hst: z.string().optional(),
		customer_tax_id_label_us_ein: z.string().optional(),
		customer_tax_id_label_de_ust_id: z.string().optional(),
		customer_tax_id_label_de_steuernummer: z.string().optional(),
		customer_tax_id_label_de_hrb: z.string().optional(),
		customer_tax_id_label_nl_kvk: z.string().optional(),
		customer_tax_id_label_fr_siret: z.string().optional(),
		customer_tax_id_label_fr_siren: z.string().optional(),
		customer_tax_id_label_gb_company: z.string().optional(),
		customer_tax_id_label_ch_uid: z.string().optional(),
		customer_tax_id_label_other: z.string().optional(),
		prepared_for: z.string().optional(),
		processed_by: z.string().optional(),
		bill_to: z.string().optional(),
		ship_to: z.string().optional(),
		billing_address: z.string().optional(),
		item: z.string().optional(),
		sku: z.string().optional(),
		qty: z.string().optional(),
		unit_price: z.string().optional(),
		unit_excl: z.string().optional(),
		total_excl: z.string().optional(),
		discount: z.string().optional(),
		packed: z.string().optional(),
		item_short: z.string().optional(),
		sku_short: z.string().optional(),
		qty_short: z.string().optional(),
		unit_excl_short: z.string().optional(),
		tax_rate_short: z.string().optional(),
		tax_amount_short: z.string().optional(),
		total_incl_tax_short: z.string().optional(),
		taxable_excl_short: z.string().optional(),
		taxable_incl_short: z.string().optional(),
		subtotal: z.string().optional(),
		subtotal_excl_tax: z.string().optional(),
		total: z.string().optional(),
		refund_total: z.string().optional(),
		total_tax: z.string().optional(),
		total_incl_tax: z.string().optional(),
		grand_total_incl_tax: z.string().optional(),
		tax: z.string().optional(),
		paid: z.string().optional(),
		tendered: z.string().optional(),
		change: z.string().optional(),
		tax_summary: z.string().optional(),
		taxable_excl: z.string().optional(),
		tax_amount: z.string().optional(),
		taxable_incl: z.string().optional(),
		invoice: z.string().optional(),
		tax_invoice: z.string().optional(),
		quote: z.string().optional(),
		receipt: z.string().optional(),
		gift_receipt: z.string().optional(),
		credit_note: z.string().optional(),
		packing_slip: z.string().optional(),
		returned_items: z.string().optional(),
		amount: z.string().optional(),
		total_refunded: z.string().optional(),
		refunded: z.string().optional(),
		net_total: z.string().optional(),
		customer_note: z.string().optional(),
		terms_and_conditions: z.string().optional(),
		a_message_for_you: z.string().optional(),
		thank_you: z.string().optional(),
		thank_you_purchase: z.string().optional(),
		thank_you_shopping: z.string().optional(),
		thank_you_business: z.string().optional(),
		gift_return_policy: z.string().optional(),
		quote_validity: z.string().optional(),
		quote_not_receipt: z.string().optional(),
		return_retain_receipt: z.string().optional(),
		kitchen: z.string().optional(),
		signature: z.string().optional(),
		document_type: z.string().optional(),
		copy: z.string().optional(),
		copy_number: z.string().optional(),
		status: z.string().optional(),
		completed: z.string().optional(),
		printed: z.string().optional(),
		opening_hours: z.string().optional(),
	})
	.catchall(z.string());

/* ──────────────── Top-level schema ──────────────── */

export const ReceiptDataSchema = z.object({
	order: ReceiptOrderSchema,
	store: ReceiptStoreMetaSchema,
	cashier: ReceiptCashierSchema,
	customer: ReceiptCustomerSchema,
	lines: z.array(ReceiptLineItemSchema),
	fees: z.array(ReceiptFeeSchema),
	shipping: z.array(ReceiptShippingSchema),
	discounts: z.array(ReceiptDiscountSchema),
	totals: ReceiptTotalsSchema,
	tax_summary: z.array(ReceiptTaxSummaryItemSchema),
	payments: z.array(ReceiptPaymentSchema),
	refunds: z.array(ReceiptRefundSchema).optional().describe('Refunds applied to this order'),
	fiscal: ReceiptFiscalSchema,
	presentation_hints: ReceiptPresentationHintsSchema,
	i18n: ReceiptI18nSchema.optional(),
});

/* ──────────────── Derived TypeScript types ──────────────── */

export type ReceiptDate = z.infer<typeof ReceiptDateSchema>;
export type ReceiptOrder = z.infer<typeof ReceiptOrderSchema>;
export type ReceiptStoreAddress = z.infer<typeof ReceiptStoreAddressSchema>;
export type ReceiptStoreMeta = z.infer<typeof ReceiptStoreMetaSchema>;
export type ReceiptCashier = z.infer<typeof ReceiptCashierSchema>;
export type ReceiptTaxId = z.infer<typeof ReceiptTaxIdSchema>;
export type ReceiptCustomer = z.infer<typeof ReceiptCustomerSchema>;
export type ReceiptLineItem = z.infer<typeof ReceiptLineItemSchema>;
export type ReceiptFee = z.infer<typeof ReceiptFeeSchema>;
export type ReceiptShipping = z.infer<typeof ReceiptShippingSchema>;
export type ReceiptDiscount = z.infer<typeof ReceiptDiscountSchema>;
export type ReceiptTotals = z.infer<typeof ReceiptTotalsSchema>;
export type ReceiptTaxSummaryItem = z.infer<typeof ReceiptTaxSummaryItemSchema>;
export type ReceiptPayment = z.infer<typeof ReceiptPaymentSchema>;
export type ReceiptRefundLine = z.infer<typeof ReceiptRefundLineSchema>;
export type ReceiptRefundFee = z.infer<typeof ReceiptRefundFeeSchema>;
export type ReceiptRefundShipping = z.infer<typeof ReceiptRefundShippingSchema>;
export type ReceiptRefund = z.infer<typeof ReceiptRefundSchema>;
export type ReceiptFiscal = z.infer<typeof ReceiptFiscalSchema>;
export type ReceiptPresentationHints = z.infer<typeof ReceiptPresentationHintsSchema>;
export type ReceiptI18n = z.infer<typeof ReceiptI18nSchema>;
export type ReceiptData = z.infer<typeof ReceiptDataSchema>;
