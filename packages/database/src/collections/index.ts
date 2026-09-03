import { ExtractDocumentTypeFromTypedRxJsonSchema, RxJsonSchema } from 'rxdb';

import { brandsLiteral } from './schemas/brands';
import { categoriesLiteral } from './schemas/categories';
import { couponsLiteral } from './schemas/coupons';
import { customersLiteral } from './schemas/customers';
// import { gatewaysLiteral } from './schemas/gateways';
// import { logsLiteral } from './schemas/logs';
import { logsLiteral } from './schemas/logs';
import { notificationsLiteral } from './schemas/notifications';
import { templatesLiteral } from './schemas/templates';
import { ordersLiteral } from './schemas/orders';
import { productsLiteral } from './schemas/products';
import { receiptEmailQueueLiteral } from './schemas/receipt-email-queue';
import { sitesLiteral } from './schemas/sites';
import { storesLiteral } from './schemas/stores';
import { tagsLiteral } from './schemas/tags';
import { taxRatesLiteral } from './schemas/tax-rates';
import { usersLiteral } from './schemas/users';
import { variationsLiteral } from './schemas/variations';
import { wpCredentialsLiteral } from './schemas/wp-credientials';
import { printerProfilesLiteral } from './schemas/printer-profiles';
import { scannerProfilesLiteral } from './schemas/scanner-profiles';
import { templatePrinterOverridesLiteral } from './schemas/template-printer-overrides';
import { sanitizeWPCredentialsData } from './wp-credentials';

import type { RxCollection, RxCollectionCreator, RxDatabase, RxDocument } from 'rxdb';

type WithJsonMetaData<T> = T extends { meta_data?: infer MetaData }
	? Omit<T, 'meta_data'> & {
			meta_data?: MetaData extends readonly (infer Entry)[]
				? (Omit<Entry, 'value'> & { value?: unknown })[]
				: MetaData;
		}
	: T;

type WithNestedJsonMetaData<T, Key extends keyof T> = Omit<T, Key> & {
	[Property in Key]?: NonNullable<T[Property]> extends readonly (infer Entry)[]
		? WithJsonMetaData<Entry>[]
		: never;
};

/**
 * Global Users
 */
type UserDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof usersLiteral>;
const userSchema: RxJsonSchema<UserDocumentType> = usersLiteral;
export type UserDocument = RxDocument<UserDocumentType>;
export type UserCollection = RxCollection<UserDocumentType>;
const users: RxCollectionCreator<UserDocumentType> = { schema: userSchema };

/**
 * Sites
 */
const siteSchema: RxJsonSchema<SiteDocumentType> = sitesLiteral;
type SiteDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof sitesLiteral>;
export type SiteDocument = RxDocument<SiteDocumentType>;
export type SiteCollection = RxCollection<SiteDocumentType>;
const sites: RxCollectionCreator<SiteDocumentType> = {
	schema: siteSchema,
	migrationStrategies: {
		1(oldDoc) {
			oldDoc.use_jwt_as_param = false;
			return oldDoc;
		},
		2(oldDoc) {
			return oldDoc;
		},
		3(oldDoc) {
			// v3 adds the optional `locale` property; existing documents need no change.
			return oldDoc;
		},
		4(oldDoc) {
			// v4 adds the optional `use_rest_route_param` flag; absent reads as
			// path transport, so existing documents need no change.
			return oldDoc;
		},
		5(oldDoc) {
			// v5 adds the optional `use_protocol_headers` flag; absent reads as
			// query transport, so existing documents need no change.
			return oldDoc;
		},
	},
};

/**
 * Stores
 */
const storeSchema: RxJsonSchema<StoreDocumentType> = storesLiteral;
type StoreDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof storesLiteral>;
export type StoreDocument = RxDocument<StoreDocumentType>;
export type StoreCollection = RxCollection<StoreDocumentType>;
const stores: RxCollectionCreator<StoreDocumentType> = {
	schema: storeSchema,
	migrationStrategies: {
		1(oldDoc: StoreDocumentType) {
			oldDoc.barcode_scanning_avg_time_input_threshold = 24;
			oldDoc.thousands_group_style = 'thousand';
			const [country, state] = ((oldDoc as any).default_country || '').split(':');
			oldDoc.store_country = country;
			oldDoc.store_state = state;
			return oldDoc;
		},
		2(oldDoc: StoreDocumentType) {
			oldDoc.tax_address = {
				country: oldDoc.store_country,
				state: oldDoc.store_state,
				postcode: oldDoc.store_postcode,
				city: oldDoc.store_city,
			};
			return oldDoc;
		},
		3(oldDoc: StoreDocumentType) {
			// Add theme field with default 'system'
			oldDoc.theme = 'system';
			return oldDoc;
		},
		4(oldDoc: StoreDocumentType) {
			oldDoc.woocommerce_calc_discounts_sequentially = 'no';
			return oldDoc;
		},
		5(oldDoc: StoreDocumentType) {
			oldDoc.active_templates = Array.isArray(oldDoc.active_templates)
				? oldDoc.active_templates
				: [];
			return oldDoc;
		},
		6(oldDoc: StoreDocumentType) {
			// Initialize wc_price_decimals from the existing price_num_decimals
			// (best available value until next server sync)
			oldDoc.wc_price_decimals = oldDoc.price_num_decimals ?? 2;
			return oldDoc;
		},
		7(oldDoc: any) {
			// opening_hours: pre-v1.9.0 plugin emitted a freeform string;
			// v1.9.0+ emits an array (inner shape varies across stores, so no
			// item-level constraint — see schema comment). Move the legacy
			// string into opening_hours_notes so user-visible content isn't
			// lost, then normalize opening_hours to [].
			const legacyNotes =
				typeof oldDoc.opening_hours_notes === 'string' ? oldDoc.opening_hours_notes : '';
			if (typeof oldDoc.opening_hours === 'string') {
				const legacyText = oldDoc.opening_hours;
				oldDoc.opening_hours_notes = legacyNotes ? `${legacyNotes}\n\n${legacyText}` : legacyText;
			} else {
				oldDoc.opening_hours_notes = legacyNotes;
			}
			oldDoc.opening_hours = [];
			return oldDoc;
		},
		8(oldDoc: any) {
			// Schema 1.4.0 introduced structured store.tax_ids[]. Older RxDB rows
			// don't have it; default to an empty array. The next server sync will
			// populate the real values when the plugin emits them.
			oldDoc.tax_ids = Array.isArray(oldDoc.tax_ids) ? oldDoc.tax_ids : [];
			return oldDoc;
		},
		9(oldDoc: any) {
			// Empty string means inherit the WordPress site's timezone.
			oldDoc.timezone = typeof oldDoc.timezone === 'string' ? oldDoc.timezone : '';
			return oldDoc;
		},
		10(oldDoc: any) {
			// #559 knob contract: per-store sync tuning, Balanced defaults.
			// Amended pre-release by the #908 re-tune (Balanced = 60 s / 50): this
			// migration has never shipped, so it writes the final default directly
			// instead of stacking a corrective migration on an unreleased one.
			oldDoc.sync_check_interval_ms = 60_000;
			oldDoc.sync_pull_batch_size = 50;
			return oldDoc;
		},
		11(oldDoc: StoreDocumentType) {
			oldDoc.prevent_overselling = false;
			return oldDoc;
		},
		12(oldDoc: StoreDocumentType) {
			// Scan sounds are opt-in per station (#717): default off so quiet
			// counters stay quiet until a cashier turns feedback on. Amended
			// pre-release with the theme/volume/per-event fields — schema v12 has
			// never shipped, so the defaults are written here directly instead of
			// stacking a migration on an unreleased version.
			oldDoc.barcode_scanning_sound_enabled = false;
			oldDoc.barcode_scanning_sound_theme = 'classic';
			oldDoc.barcode_scanning_sound_volume = 0.15;
			oldDoc.barcode_scanning_sound_success_enabled = true;
			oldDoc.barcode_scanning_sound_failure_enabled = true;
			oldDoc.barcode_scanning_sound_haptic_enabled = true;
			return oldDoc;
		},
		13(oldDoc: StoreDocumentType) {
			// The next server sync populates the real receipt label dictionary.
			oldDoc.receipt_i18n = {};
			return oldDoc;
		},
		14(oldDoc: StoreDocumentType) {
			// v14 only widens shipping_tax_class: the enum of WooCommerce's four
			// built-in classes is gone, because merchant-defined tax classes are
			// selectable and were being rejected. Widening never invalidates a
			// value that already validated, so existing documents pass through.
			return oldDoc;
		},
		15(oldDoc: StoreDocumentType) {
			// v15 adds optional tracking consent; the next server sync populates it.
			return oldDoc;
		},
		16(oldDoc: StoreDocumentType) {
			// v16 adds the optional display capability; the next server sync populates it.
			return oldDoc;
		},
	},
};

/**
 * WordPress Credentials
 */
const wpCredentialsSchema: RxJsonSchema<WPCredentialsDocumentType> = wpCredentialsLiteral;
type WPCredentialsDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof wpCredentialsLiteral
>;
export type WPCredentialsDocument = RxDocument<WPCredentialsDocumentType>;
export type WPCredentialsCollection = RxCollection<WPCredentialsDocumentType>;
const wp_credentials: RxCollectionCreator<WPCredentialsDocumentType> = {
	schema: wpCredentialsSchema,
	migrationStrategies: {
		1(oldDoc) {
			return oldDoc;
		},
		2(oldDoc) {
			// Added optional `role` field — no transformation needed.
			return sanitizeWPCredentialsData(oldDoc) as WPCredentialsDocumentType;
		},
		3(oldDoc) {
			// `role` (string) → `roles` (string[]) and strip fields outside
			// the strict schema, including OAuth metadata like `token_type`.
			return sanitizeWPCredentialsData(oldDoc) as WPCredentialsDocumentType;
		},
		4(oldDoc) {
			// v3 rows may already contain token_type/unknown fields from earlier
			// builds, so force one more migration pass to sanitize them.
			return sanitizeWPCredentialsData(oldDoc) as WPCredentialsDocumentType;
		},
		5(oldDoc) {
			// Added optional `capabilities`; absence deliberately means unknown.
			return oldDoc;
		},
	},
};

/**
 * Logs
 */
// const logsTyped = toTypedRxJsonSchema(logsLiteral);
// export const LogSchema: RxJsonSchema<LogDocument> = logsLiteral;
// export type LogDocument = ExtractDocumentTypeFromTypedRxJsonSchema<typeof logsTyped>;
// export type LogCollection = RxCollection<LogDocument>;
// const logs: RxCollectionCreator<LogDocument> = { schema: logsLiteral };

/**
 * Products
 */
type ProductDocumentType = WithJsonMetaData<
	ExtractDocumentTypeFromTypedRxJsonSchema<typeof productsLiteral>
>;
export type ProductDocument = RxDocument<ProductDocumentType>;
export type ProductCollection = RxCollection<ProductDocumentType>;

/**
 * Product Variations
 */
type ProductVariationDocumentType = WithJsonMetaData<
	ExtractDocumentTypeFromTypedRxJsonSchema<typeof variationsLiteral>
>;
export type ProductVariationDocument = RxDocument<ProductVariationDocumentType>;
export type ProductVariationCollection = RxCollection<ProductVariationDocumentType>;

/**
 * Product Categories
 */
type ProductCategoryDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof categoriesLiteral
>;
export type ProductCategoryDocument = RxDocument<ProductCategoryDocumentType>;
export type ProductCategoryCollection = RxCollection<ProductCategoryDocumentType>;

/**
 * Product Tags
 */
type ProductTagDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof tagsLiteral>;
export type ProductTagDocument = RxDocument<ProductTagDocumentType>;
export type ProductTagCollection = RxCollection<ProductTagDocumentType>;

/**
 * Product Brands
 */
type ProductBrandDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof brandsLiteral>;
export type ProductBrandDocument = RxDocument<ProductBrandDocumentType>;
export type ProductBrandCollection = RxCollection<ProductBrandDocumentType>;

/**
 * Orders
 */
type OrderDocumentType = WithNestedJsonMetaData<
	WithJsonMetaData<ExtractDocumentTypeFromTypedRxJsonSchema<typeof ordersLiteral>>,
	'line_items' | 'tax_lines' | 'shipping_lines' | 'fee_lines' | 'coupon_lines'
>;
export type OrderDocument = RxDocument<OrderDocumentType> & {
	readonly isNew?: boolean;
};
export type OrderCollection = RxCollection<OrderDocumentType>;

/**
 * Temporary order (the POS "new order" template document, ADR 0028 stage I).
 *
 * Engine-shaped on purpose: `{ uuid, payload }` — the same face an engine order resident
 * presents — so the cart reads exactly one shape whether the current order is a real
 * resident or the per-till template. The temp DB itself, the `.isNew` marker, and the
 * birth heuristic all stay (ADR 0030 deletes them post-GA); only the stored shape aligns.
 * `payload` is deliberately unvalidated interior (same stance as the engine's collections):
 * the wire-faithful order body lives inside it.
 */
type TemporaryOrderDocumentType = {
	uuid: string;
	payload: OrderDocumentType;
};
export type TemporaryOrderDocument = RxDocument<TemporaryOrderDocumentType> & {
	readonly isNew?: boolean;
};
export type TemporaryOrderCollection = RxCollection<TemporaryOrderDocumentType>;
const temporaryOrders: RxCollectionCreator<TemporaryOrderDocumentType> = {
	schema: {
		title: 'Temporary POS order (engine-shaped template)',
		version: 0,
		type: 'object',
		primaryKey: 'uuid',
		properties: {
			uuid: {
				description: 'Template document identity (engine record uuid once born).',
				type: 'string',
				maxLength: 36,
			},
			payload: {
				description: 'The order body, wire-shaped — same interior as an engine resident.',
				type: 'object',
				additionalProperties: true,
			},
		},
		required: ['uuid', 'payload'],
	} as RxJsonSchema<TemporaryOrderDocumentType>,
};

/**
 * Customers
 */
type CustomerDocumentType = WithJsonMetaData<
	ExtractDocumentTypeFromTypedRxJsonSchema<typeof customersLiteral>
>;
export type CustomerDocument = RxDocument<CustomerDocumentType>;
export type CustomerCollection = RxCollection<CustomerDocumentType>;

/**
 * Coupons
 */
type CouponDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof couponsLiteral>;
export type CouponDocument = RxDocument<CouponDocumentType>;
export type CouponCollection = RxCollection<CouponDocumentType>;

/**
 * Taxes
 */
type TaxRateDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof taxRatesLiteral>;
export type TaxRateDocument = RxDocument<TaxRateDocumentType>;
export type TaxRateCollection = RxCollection<TaxRateDocumentType>;

/**
 * Gateways
 */
// const gatewaysTyped = toTypedRxJsonSchema(gatewaysLiteral);
// export const GatewaySchema: RxJsonSchema<GatewayDocument> = gatewaysLiteral;
// export type GatewayDocument = ExtractDocumentTypeFromTypedRxJsonSchema<typeof gatewaysTyped>;
// export type GatewayCollection = RxCollection<GatewayDocument>;
// const payment_gateways: RxCollectionCreator<GatewayDocument> = { schema: gatewaysLiteral };

/**
 * Logs
 */
const logSchema: RxJsonSchema<LogDocumentType> = logsLiteral;
type LogDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof logsLiteral>;
export type LogDocument = RxDocument<LogDocumentType>;
export type LogCollection = RxCollection<LogDocumentType>;
const logs: RxCollectionCreator<LogDocumentType> = {
	schema: logSchema,
	migrationStrategies: {
		1: (oldDoc: any) => {
			oldDoc.level = String(oldDoc.level ?? 'info').slice(0, 16);
			return oldDoc;
		}, // v0→v1 only adds indexes; documents are unchanged
		2: (oldDoc: any) => {
			const level = String(oldDoc.level ?? 'info');
			const errorCode = oldDoc.context?.errorCode;

			if (typeof errorCode === 'string') oldDoc.code = errorCode;
			if (level === 'success') {
				oldDoc.level = 'info';
				oldDoc.outcome = 'ok';
			} else if (level === 'audit') {
				oldDoc.level = 'info';
				oldDoc.category = 'db.audit';
			} else {
				oldDoc.level = ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info';
			}

			oldDoc.count = 1;
			oldDoc.firstSeen = oldDoc.timestamp;
			oldDoc.lastSeen = oldDoc.timestamp;
			if (typeof oldDoc.sizeBytes !== 'number') {
				try {
					oldDoc.sizeBytes = 0;
					let sizeBytes = new TextEncoder().encode(JSON.stringify(oldDoc)).byteLength;
					while (oldDoc.sizeBytes !== sizeBytes) {
						oldDoc.sizeBytes = sizeBytes;
						sizeBytes = new TextEncoder().encode(JSON.stringify(oldDoc)).byteLength;
					}
				} catch {
					delete oldDoc.sizeBytes;
					// leave unset; retention serializes rows without sizeBytes
				}
			}
			return oldDoc;
		},
		// v2→v3 only widens the `outcome` enum (adds 'recovered'); documents are unchanged.
		3: (oldDoc: any) => oldDoc,
	},
	options: {
		searchFields: ['message', 'context.error', 'context.errorCode', 'context.search'],
	},
};

/**
 * Notifications
 */
const notificationSchema: RxJsonSchema<NotificationDocumentType> = notificationsLiteral;
type NotificationDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof notificationsLiteral
>;
export type NotificationDocument = RxDocument<NotificationDocumentType>;
export type NotificationCollection = RxCollection<NotificationDocumentType>;
const notifications: RxCollectionCreator<NotificationDocumentType> = {
	schema: notificationSchema,
};

/**
 * Templates
 */
const templateSchema: RxJsonSchema<TemplateDocumentType> = templatesLiteral;
type TemplateDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof templatesLiteral>;
export type TemplateDocument = RxDocument<TemplateDocumentType>;
export type TemplateCollection = RxCollection<TemplateDocumentType>;
const templates: RxCollectionCreator<TemplateDocumentType> = {
	schema: templateSchema,
	migrationStrategies: {
		1(oldDoc) {
			// v1: Added output_type and paper_width fields — populated on next sync
			return oldDoc;
		},
	},
};

/**
 * Scanner Profiles (local-only, not synced to server)
 */
const scannerProfileSchema: RxJsonSchema<ScannerProfileDocumentType> = scannerProfilesLiteral;
type ScannerProfileDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof scannerProfilesLiteral
>;
export type ScannerProfileDocument = RxDocument<ScannerProfileDocumentType>;
export type ScannerProfileCollection = RxCollection<ScannerProfileDocumentType>;
// No migrationStrategies: this collection has never shipped in a released
// build, so the only shape that exists anywhere is the current one. The version
// history it used to carry described states no install has ever held.
const scanner_profiles: RxCollectionCreator<ScannerProfileDocumentType> = {
	schema: scannerProfileSchema,
};

/**
 * Printer Profiles (local-only, not synced to server)
 */
const printerProfileSchema: RxJsonSchema<PrinterProfileDocumentType> = printerProfilesLiteral;
type PrinterProfileDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof printerProfilesLiteral
>;
export type PrinterProfileDocument = RxDocument<PrinterProfileDocumentType>;
export type PrinterProfileCollection = RxCollection<PrinterProfileDocumentType>;
const printer_profiles: RxCollectionCreator<PrinterProfileDocumentType> = {
	schema: printerProfileSchema,
	migrationStrategies: {
		1(oldDoc) {
			// v1: Added isBuiltIn field for platform-provided printers
			oldDoc.isBuiltIn = false;
			return oldDoc;
		},
		2(oldDoc) {
			// v2: Added nativeInterfaceType for vendor-native transports
			return oldDoc;
		},
		3(oldDoc) {
			// v3: Changed the default columns metadata from 48 to 42.
			// Preserve explicit existing profile values.
			return oldDoc;
		},
		4(oldDoc) {
			// v4: Added emitEscPrintMode to control ESC ! / GS ! dual size emission.
			// Default to true so existing profiles get the broader compatibility behavior.
			oldDoc.emitEscPrintMode = true;
			return oldDoc;
		},
		5(oldDoc) {
			// v5: removed the dead `autoPrint` field; added `fullReceiptRaster` (default off).
			delete oldDoc.autoPrint;
			oldDoc.fullReceiptRaster = false;
			return oldDoc;
		},
		6(oldDoc) {
			// v6: added the optional `cloudPrinterId` field and the `cloud` connectionType.
			// Existing profiles need no change — the new field is optional.
			return oldDoc;
		},
		7(oldDoc) {
			// v7: added the optional `cloudProvider` field (server-side print provider).
			// Existing profiles need no change — the new field is optional.
			return oldDoc;
		},
		8(oldDoc) {
			// v8: added drawerConnector. Preserve valid pin5, default everything else to pin2.
			oldDoc.drawerConnector = oldDoc.drawerConnector === 'pin5' ? 'pin5' : 'pin2';
			return oldDoc;
		},
	},
};

/**
 * Template Printer Overrides (local-only, not synced to server)
 */
const templatePrinterOverrideSchema: RxJsonSchema<TemplatePrinterOverrideDocumentType> =
	templatePrinterOverridesLiteral;
type TemplatePrinterOverrideDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof templatePrinterOverridesLiteral
>;
export type TemplatePrinterOverrideDocument = RxDocument<TemplatePrinterOverrideDocumentType>;
export type TemplatePrinterOverrideCollection = RxCollection<TemplatePrinterOverrideDocumentType>;
const template_printer_overrides: RxCollectionCreator<TemplatePrinterOverrideDocumentType> = {
	schema: templatePrinterOverrideSchema,
	migrationStrategies: {
		1(oldDoc) {
			// v1: widened printer_profile_id into a generic printer target id.
			// Existing local printer profile ids and `system` targets need no change.
			return oldDoc;
		},
	},
};

/**
 * Receipt Email Queue (local-only, not synced to server)
 */
const receiptEmailQueueSchema: RxJsonSchema<ReceiptEmailQueueDocumentType> =
	receiptEmailQueueLiteral;
type ReceiptEmailQueueDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof receiptEmailQueueLiteral
>;
export type ReceiptEmailQueueDocument = RxDocument<ReceiptEmailQueueDocumentType>;
export type ReceiptEmailQueueCollection = RxCollection<ReceiptEmailQueueDocumentType>;
const receipt_email_queue: RxCollectionCreator<ReceiptEmailQueueDocumentType> = {
	schema: receiptEmailQueueSchema,
};

export type UserCollections = {
	users: UserCollection;
	sites: SiteCollection;
	wp_credentials: WPCredentialsCollection;
	stores: StoreCollection;
	// logs: LogCollection;
};

export type StoreCollections = {
	logs: LogCollection;
	notifications: NotificationCollection;
	templates: TemplateCollection;
	printer_profiles: PrinterProfileCollection;
	scanner_profiles: ScannerProfileCollection;
	template_printer_overrides: TemplatePrinterOverrideCollection;
	receipt_email_queue: ReceiptEmailQueueCollection;
};

export type TemporaryCollections = {
	orders: TemporaryOrderCollection;
};

export type UserDatabase = RxDatabase<UserCollections>;
export type StoreDatabase = RxDatabase<StoreCollections>;
export type TemporaryDatabase = RxDatabase<TemporaryCollections>;

export const userCollections = {
	//logs,
	users,
	sites,
	wp_credentials,
	stores,
};

export const storeCollections = {
	logs,
	notifications,
	templates,
	printer_profiles,
	scanner_profiles,
	template_printer_overrides,
	receipt_email_queue,
};

export const temporaryCollections = {
	orders: temporaryOrders,
};
