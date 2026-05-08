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
import { sitesLiteral } from './schemas/sites';
import { storesLiteral } from './schemas/stores';
import { syncLiteral } from './schemas/sync';
import { tagsLiteral } from './schemas/tags';
import { taxRatesLiteral } from './schemas/tax-rates';
import { usersLiteral } from './schemas/users';
import { variationsLiteral } from './schemas/variations';
import { wpCredentialsLiteral } from './schemas/wp-credientials';
import { printerProfilesLiteral } from './schemas/printer-profiles';
import { templatePrinterOverridesLiteral } from './schemas/template-printer-overrides';
import { toSortableInteger } from './utils';

import type { RxCollection, RxCollectionCreator, RxDatabase, RxDocument } from 'rxdb';

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
			return oldDoc;
		},
		3(oldDoc: any) {
			// `role` (string) → `roles` (string[]). Cashiers can have multiple
			// WordPress roles. Preserve the existing value as a single-element
			// array when present. Idempotent: if `roles` is already a valid
			// array, keep it and just drop any lingering `role`.
			if (Array.isArray(oldDoc.roles)) {
				oldDoc.roles = oldDoc.roles.filter(
					(r: unknown): r is string => typeof r === 'string' && r.length > 0
				);
			} else {
				const legacyRole = oldDoc.role;
				oldDoc.roles = typeof legacyRole === 'string' && legacyRole.length > 0 ? [legacyRole] : [];
			}
			delete oldDoc.role;
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
const productSchema: RxJsonSchema<ProductDocumentType> = productsLiteral;
type ProductDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof productsLiteral>;
export type ProductDocument = RxDocument<ProductDocumentType>;
export type ProductCollection = RxCollection<ProductDocumentType>;
const products: RxCollectionCreator<ProductDocumentType> = {
	schema: productSchema,
	options: {
		searchFields: ['name', 'sku', 'barcode'],
		middlewares: {
			preInsert: {
				handle: (doc: ProductDocumentType) => {
					doc.sortable_price = toSortableInteger(doc.price);
					return doc;
				},
				parallel: false,
			},
			preSave: {
				handle: (doc: ProductDocumentType) => {
					doc.sortable_price = toSortableInteger(doc.price);
					return doc;
				},
				parallel: false,
			},
		},
	},
	migrationStrategies: {
		1(oldDoc) {
			oldDoc.sortable_price = toSortableInteger(oldDoc.price);
			return oldDoc;
		},
		2(oldDoc) {
			return oldDoc;
		},
		// v3: Removed multipleOf constraint from sortable_price (floating-point incompatibility)
		3(oldDoc) {
			return oldDoc;
		},
		// v4: Changed sortable_price from integer to number to avoid 32-bit overflow for prices > $2,147
		4(oldDoc) {
			return oldDoc;
		},
		// v5: Removed format: 'uri' from image.src and permalink (RxDB v17 strict validation)
		5(oldDoc) {
			return oldDoc;
		},
	},
};

/**
 * Product Variations
 */
const productVariationSchema: RxJsonSchema<ProductVariationDocumentType> = variationsLiteral;
type ProductVariationDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof variationsLiteral
>;
export type ProductVariationDocument = RxDocument<ProductVariationDocumentType>;
export type ProductVariationCollection = RxCollection<ProductVariationDocumentType>;
const variations: RxCollectionCreator<ProductVariationDocumentType> = {
	schema: productVariationSchema,
	options: {
		searchFields: ['sku', 'barcode'],
		middlewares: {
			preInsert: {
				handle: (doc: ProductVariationDocumentType) => {
					doc.sortable_price = toSortableInteger(doc.price);
					return doc;
				},
				parallel: false,
			},
			preSave: {
				handle: (doc: ProductVariationDocumentType) => {
					doc.sortable_price = toSortableInteger(doc.price);
					return doc;
				},
				parallel: false,
			},
		},
	},
	migrationStrategies: {
		1(oldDoc) {
			oldDoc.type = 'variation';
			return oldDoc;
		},
		2(oldDoc) {
			oldDoc.sortable_price = toSortableInteger(oldDoc.price);
			return oldDoc;
		},
		3(oldDoc) {
			return oldDoc;
		},
		// v4: Removed multipleOf constraint from sortable_price (floating-point incompatibility)
		4(oldDoc) {
			return oldDoc;
		},
		// v5: Changed sortable_price from integer to number to avoid 32-bit overflow for prices > $2,147
		5(oldDoc) {
			return oldDoc;
		},
		// v6: Removed format: 'uri' from image.src and permalink (RxDB v17 strict validation)
		6(oldDoc) {
			return oldDoc;
		},
	},
};

/**
 * Product Categories
 */
const productCategorySchema: RxJsonSchema<ProductCategoryDocumentType> = categoriesLiteral;
type ProductCategoryDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof categoriesLiteral
>;
export type ProductCategoryDocument = RxDocument<ProductCategoryDocumentType>;
export type ProductCategoryCollection = RxCollection<ProductCategoryDocumentType>;
const categories: RxCollectionCreator<ProductCategoryDocumentType> = {
	schema: productCategorySchema,
	options: {
		searchFields: ['name'],
	},
	migrationStrategies: {
		1(oldDoc) {
			return oldDoc;
		},
		2(oldDoc) {
			return oldDoc;
		},
		// v3: Removed format: 'uri' from image.src (RxDB v17 strict validation)
		3(oldDoc) {
			return oldDoc;
		},
	},
};

/**
 * Product Tags
 */
const productTagSchema: RxJsonSchema<ProductTagDocumentType> = tagsLiteral;
type ProductTagDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof tagsLiteral>;
export type ProductTagDocument = RxDocument<ProductTagDocumentType>;
export type ProductTagCollection = RxCollection<ProductTagDocumentType>;
const tags: RxCollectionCreator<ProductTagDocumentType> = {
	schema: productTagSchema,
	options: {
		searchFields: ['name'],
	},
	migrationStrategies: {
		1(oldDoc) {
			return oldDoc;
		},
	},
};

/**
 * Product Brands
 */
const productBrandSchema: RxJsonSchema<ProductBrandDocumentType> = brandsLiteral;
type ProductBrandDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof brandsLiteral>;
export type ProductBrandDocument = RxDocument<ProductBrandDocumentType>;
export type ProductBrandCollection = RxCollection<ProductBrandDocumentType>;
const brands: RxCollectionCreator<ProductBrandDocumentType> = {
	schema: productBrandSchema,
	options: {
		searchFields: ['name'],
	},
	migrationStrategies: {
		// v1: Removed format: 'uri' from image.src (RxDB v17 strict validation)
		1(oldDoc) {
			return oldDoc;
		},
	},
};

/**
 * Orders
 */
const orderSchema: RxJsonSchema<OrderDocumentType> = ordersLiteral;
type OrderDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof ordersLiteral>;
export type OrderDocument = RxDocument<OrderDocumentType> & { readonly isNew?: boolean };
export type OrderCollection = RxCollection<OrderDocumentType>;
const orders: RxCollectionCreator<OrderDocumentType> = {
	schema: orderSchema,
	options: {
		searchFields: [
			'number',
			'billing.first_name',
			'billing.last_name',
			'billing.email',
			'billing.company',
			'billing.phone',
		],
		middlewares: {
			preInsert: {
				handle: (doc: OrderDocumentType) => {
					doc.sortable_total = toSortableInteger(doc.total);
					return doc;
				},
				parallel: false,
			},
			preSave: {
				handle: (doc: OrderDocumentType) => {
					doc.sortable_total = toSortableInteger(doc.total);
					return doc;
				},
				parallel: false,
			},
		},
	},
	migrationStrategies: {
		1(oldDoc) {
			oldDoc.sortable_total = toSortableInteger(oldDoc.total);
			return oldDoc;
		},
		2(oldDoc) {
			return oldDoc;
		},
		// v3: Removed multipleOf constraint from sortable_total (floating-point incompatibility)
		3(oldDoc) {
			return oldDoc;
		},
		// v4: Allow null coupon_lines code for WooCommerce deletion markers
		4(oldDoc) {
			return oldDoc;
		},
		// v5: Allow null line_items image for misc products without images
		5(oldDoc) {
			return oldDoc;
		},
		// v6: Added top-level tax_ids: TaxId[] (customer tax-ID snapshot on the order)
		6(oldDoc) {
			oldDoc.tax_ids = Array.isArray(oldDoc.tax_ids) ? oldDoc.tax_ids : [];
			return oldDoc;
		},
	},
};

/**
 * Customers
 */
const customerSchema: RxJsonSchema<CustomerDocumentType> = customersLiteral;
type CustomerDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof customersLiteral>;
export type CustomerDocument = RxDocument<CustomerDocumentType>;
export type CustomerCollection = RxCollection<CustomerDocumentType>;
const customers: RxCollectionCreator<CustomerDocumentType> = {
	schema: customerSchema,
	options: {
		searchFields: [
			'first_name',
			'last_name',
			'email',
			'username',
			'billing.first_name',
			'billing.last_name',
			'billing.email',
			'billing.company',
			'billing.phone',
		],
	},
	migrationStrategies: {
		1(oldDoc) {
			return oldDoc;
		},
		2(oldDoc) {
			return oldDoc;
		},
		// v3: Added top-level tax_ids: TaxId[] (canonical customer tax IDs)
		3(oldDoc) {
			oldDoc.tax_ids = Array.isArray(oldDoc.tax_ids) ? oldDoc.tax_ids : [];
			return oldDoc;
		},
	},
};

/**
 * Coupons
 */
const couponSchema: RxJsonSchema<CouponDocumentType> = couponsLiteral;
type CouponDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof couponsLiteral>;
export type CouponDocument = RxDocument<CouponDocumentType>;
export type CouponCollection = RxCollection<CouponDocumentType>;
const coupons: RxCollectionCreator<CouponDocumentType> = {
	schema: couponSchema,
	options: {
		searchFields: ['code', 'description'],
	},
	migrationStrategies: {
		1(oldDoc) {
			oldDoc.status = oldDoc.status || '';
			oldDoc.date_created = oldDoc.date_created || '';
			oldDoc.date_modified = oldDoc.date_modified || '';
			oldDoc.date_expires = oldDoc.date_expires || null;
			oldDoc.links = oldDoc.links || {};
			return oldDoc;
		},
	},
};

/**
 * Taxes
 */
const taxRateSchema: RxJsonSchema<TaxRateDocumentType> = taxRatesLiteral;
type TaxRateDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof taxRatesLiteral>;
export type TaxRateDocument = RxDocument<TaxRateDocumentType>;
export type TaxRateCollection = RxCollection<TaxRateDocumentType>;
const taxes: RxCollectionCreator<TaxRateDocumentType> = { schema: taxRateSchema };

/**
 * Gateways
 */
// const gatewaysTyped = toTypedRxJsonSchema(gatewaysLiteral);
// export const GatewaySchema: RxJsonSchema<GatewayDocument> = gatewaysLiteral;
// export type GatewayDocument = ExtractDocumentTypeFromTypedRxJsonSchema<typeof gatewaysTyped>;
// export type GatewayCollection = RxCollection<GatewayDocument>;
// const payment_gateways: RxCollectionCreator<GatewayDocument> = { schema: gatewaysLiteral };

/**
 * Sync
 */
const syncSchema: RxJsonSchema<SyncDocumentType> = syncLiteral;
type SyncDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof syncLiteral>;
export type SyncDocument = RxDocument<SyncDocumentType>;
export type SyncCollection = RxCollection<SyncDocumentType>;
const sync: RxCollectionCreator<SyncDocumentType> = { schema: syncSchema };

/**
 * Logs
 */
const logSchema: RxJsonSchema<LogDocumentType> = logsLiteral;
type LogDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof logsLiteral>;
export type LogDocument = RxDocument<LogDocumentType>;
export type LogCollection = RxCollection<LogDocumentType>;
const logs: RxCollectionCreator<LogDocumentType> = {
	schema: logSchema,
	options: {
		searchFields: ['message', 'context.error', 'context.errorCode'],
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
};

export type UserCollections = {
	users: UserCollection;
	sites: SiteCollection;
	wp_credentials: WPCredentialsCollection;
	stores: StoreCollection;
	// logs: LogCollection;
};

export type StoreCollections = {
	products: ProductCollection;
	variations: ProductVariationCollection;
	orders: OrderCollection;
	customers: CustomerCollection;
	coupons: CouponCollection;
	taxes: TaxRateCollection;
	// payment_gateways: GatewayCollection;
	'products/categories': ProductCategoryCollection;
	'products/tags': ProductTagCollection;
	'products/brands': ProductBrandCollection;
	logs: LogCollection;
	notifications: NotificationCollection;
	templates: TemplateCollection;
	printer_profiles: PrinterProfileCollection;
	template_printer_overrides: TemplatePrinterOverrideCollection;
};

export type SyncCollections = {
	products: SyncCollection;
	variations: SyncCollection;
	orders: SyncCollection;
	customers: SyncCollection;
	coupons: SyncCollection;
	taxes: SyncCollection;
	// payment_gateways: GatewayCollection;
	'products/categories': SyncCollection;
	'products/tags': SyncCollection;
	'products/brands': SyncCollection;
	templates: SyncCollection;
};

export type TemporaryCollections = {
	orders: OrderCollection;
};

export type UserDatabase = RxDatabase<UserCollections>;
export type StoreDatabase = RxDatabase<StoreCollections>;
export type SyncDatabase = RxDatabase<SyncCollections>;
export type TemporaryDatabase = RxDatabase<TemporaryCollections>;

export const userCollections = {
	//logs,
	users,
	sites,
	wp_credentials,
	stores,
};

export const storeCollections = {
	products,
	variations,
	orders,
	customers,
	coupons,
	taxes, // NOTE: WC REST API uses 'taxes', not 'tax_rates', going against all other endpoints.
	// payment_gateways,
	'products/categories': categories, // NOTE: WC REST API uses 'products/categories' endpoint
	'products/tags': tags, // NOTE: WC REST API uses 'products/tags' endpoint
	'products/brands': brands, // NOTE: WC REST API uses 'products/brands' endpoint
	logs,
	notifications,
	templates,
	printer_profiles,
	template_printer_overrides,
};

// @NOTE: sync collection should have corresponding collections in storeCollections
export const syncCollections = {
	products: sync,
	variations: sync,
	orders: sync,
	customers: sync,
	coupons: sync,
	taxes: sync,
	// payment_gateways: sync,
	'products/categories': sync,
	'products/tags': sync,
	'products/brands': sync,
	templates: sync,
};

export const temporaryCollections = {
	orders,
};
