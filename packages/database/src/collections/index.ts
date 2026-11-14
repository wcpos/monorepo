import { ExtractDocumentTypeFromTypedRxJsonSchema, RxJsonSchema } from 'rxdb';

import { closuresLiteral } from './schemas/closures';
import { brandsLiteral } from './schemas/brands';
import { categoriesLiteral } from './schemas/categories';
import { couponsLiteral } from './schemas/coupons';
import { customersLiteral } from './schemas/customers';
import { logsLiteral } from './schemas/logs';
import { notificationsLiteral } from './schemas/notifications';
import { templatesLiteral } from './schemas/templates';
import { ordersLiteral } from './schemas/orders';
import { refundsLiteral } from './schemas/refunds';
import { productsLiteral } from './schemas/products';
import { registerSessionsLiteral } from './schemas/register-sessions';
import { cashMovementsLiteral } from './schemas/cash-movements';
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
	migrationStrategies: { 1: (oldDoc) => oldDoc },
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
};

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

export type RefundDocumentType = WithNestedJsonMetaData<
	WithJsonMetaData<ExtractDocumentTypeFromTypedRxJsonSchema<typeof refundsLiteral>>,
	'line_items' | 'tax_lines' | 'shipping_lines' | 'fee_lines'
>;
export type RefundDocument = RxDocument<RefundDocumentType>;
export type RefundCollection = RxCollection<RefundDocumentType>;

/**
 * Taxes
 */
type TaxRateDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof taxRatesLiteral>;
export type TaxRateDocument = RxDocument<TaxRateDocumentType>;
export type TaxRateCollection = RxCollection<TaxRateDocumentType>;

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
		searchFields: ['message', 'context.error', 'context.errorCode', 'context.search'],
		// NO in-memory search structure for logs — the Logs screen searches these
		// fields with a bounded substring scan instead (use-local-query). Measured
		// 2026-09-15 on a 46k-row day (an overnight escalation storm on a merchant
		// store): mirroring every row in the renderer cost 21.5 s of blocked main
		// thread and ~350 MB of heap, while the same rows regex-scan in 40 ms, and on
		// the web that scan runs in the storage worker. Logs are the one searched
		// collection that churns without bound (retention is bytes, not rows), so a
		// structure sized for a catalogue is the wrong shape here (#2411 keeps this).
		searchIndex: false,
		// The logger writes the fold of the searched fields here (foldLogSearchText),
		// so the scan is an exact fold-space match — any script, any normal form —
		// the same fold the search blob applies. The raw searchFields above are
		// the fallback for rows written before this field existed.
		searchFoldedField: 'context.fold',
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

export type ClosureRow = ExtractDocumentTypeFromTypedRxJsonSchema<typeof closuresLiteral>;
export type ClosureDocument = RxDocument<ClosureRow>;
export type ClosureCollection = RxCollection<ClosureRow>;
const closures: RxCollectionCreator<ClosureRow> = {
	schema: closuresLiteral,
};

export type RegisterSessionRow = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof registerSessionsLiteral
>;
export type RegisterSessionDocument = RxDocument<RegisterSessionRow>;
export type RegisterSessionCollection = RxCollection<RegisterSessionRow>;
const register_sessions: RxCollectionCreator<RegisterSessionRow> = {
	schema: registerSessionsLiteral,
};
export type CashMovementRow = ExtractDocumentTypeFromTypedRxJsonSchema<typeof cashMovementsLiteral>;
export type CashMovementDocument = RxDocument<CashMovementRow>;
export type CashMovementCollection = RxCollection<CashMovementRow>;
const cash_movements: RxCollectionCreator<CashMovementRow> = {
	schema: cashMovementsLiteral,
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
	closures: ClosureCollection;
	register_sessions: RegisterSessionCollection;
	cash_movements: CashMovementCollection;
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
	closures,
	register_sessions,
	cash_movements,
};

export const temporaryCollections = {
	orders: temporaryOrders,
};
