// Import type augmentations for RxDB
import './types.d';

import './plugins';

export { createUserDB, createStoreDB, createTemporaryDB } from './create-db';
export { userCollections, storeCollections } from './collections';
export { sanitizeWPCredentialsData } from './collections/wp-credentials';
export {
	CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY,
	scheduleClearLocalDataOnNextLoad,
} from './clear-local-data-flag';
export { clearAllDB } from './clear-all-db';
export { measureAppStorage } from './measure-storage';
export type { StorageFootprint, StorageFootprintEntry } from './measure-storage';
export {
	SCOPE_DATABASE_NAME_ANYWHERE,
	isLegacyAppDatabaseName,
	isStoreDatabaseName,
	isFastStoreDatabaseName,
} from './database-names';
export { purgeLegacyDatabases } from './purge-legacy-db';
export type { PurgeLegacyDBResult } from './purge-legacy-db';

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
	CouponDocument,
	CustomerDocument,
	LogCollection,
	LogDocument,
	NotificationCollection,
	NotificationDocument,
	OrderDocument,
	ProductBrandDocument,
	ProductCategoryDocument,
	ProductCollection,
	ProductDocument,
	ProductTagDocument,
	ProductVariationCollection,
	ProductVariationDocument,
	SiteCollection,
	SiteDocument,
	StoreCollections,
	StoreDatabase,
	StoreDocument,
	TaxRateDocument,
	TemplateDocument,
	UserDatabase,
	UserDocument,
	WPCredentialsDocument,
	PrinterProfileDocument,
	ScannerProfileDocument,
	TemplatePrinterOverrideDocument,
	ReceiptEmailQueueCollection,
} from './collections';
