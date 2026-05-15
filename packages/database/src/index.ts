import './plugins';

// Import type augmentations for RxDB
import './types.d';

export { createUserDB, createStoreDB, createTemporaryDB, createFastStoreDB } from './create-db';
export { userCollections, storeCollections, syncCollections } from './collections';
export { sanitizeWPCredentialsData } from './collections/wp-credentials';
export { clearAllDB } from './clear-all-db';
export type { ClearDBResult } from './clear-all-db';
export type { FlexSearchInstance } from './types.d';

/**
 * Re-export some rxdb helpers
 */
export { isRxDocument, isRxQuery, isRxCollection, isRxDatabase } from 'rxdb';

/**
 * Re-export the canonical TaxId type and supporting constants from the shared
 * sub-schema (used inside customers.tax_ids and orders.tax_ids).
 */
export { TAX_ID_TYPES } from './collections/schemas/tax-id';
export type { TaxId, TaxIdType, TaxIdVerified } from './collections/schemas/tax-id';

/**
 * Re-export types
 */
export type {
	CouponCollection,
	CouponDocument,
	CustomerCollection,
	CustomerDocument,
	LogCollection,
	LogDocument,
	NotificationCollection,
	NotificationDocument,
	OrderCollection,
	OrderDocument,
	ProductCategoryCollection,
	ProductCategoryDocument,
	ProductCollection,
	ProductDocument,
	ProductTagCollection,
	ProductTagDocument,
	ProductVariationCollection,
	ProductVariationDocument,
	SiteCollection,
	SiteDocument,
	StoreCollection,
	StoreCollections,
	StoreDatabase,
	StoreDocument,
	SyncCollection,
	SyncDatabase,
	SyncDocument,
	TaxRateCollection,
	TaxRateDocument,
	TemplateCollection,
	TemplateDocument,
	TemporaryDatabase,
	UserCollection,
	UserDatabase,
	UserDocument,
	WPCredentialsCollection,
	WPCredentialsDocument,
	PrinterProfileCollection,
	PrinterProfileDocument,
	TemplatePrinterOverrideCollection,
	TemplatePrinterOverrideDocument,
} from './collections';
