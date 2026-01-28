import './plugins';

// Import type augmentations for RxDB
import './types.d';

export { createUserDB, createStoreDB, createTemporaryDB, createFastStoreDB } from './create-db';
export { userCollections, storeCollections, syncCollections } from './collections';
export { clearAllDB } from './clear-all-db';
export type { ClearDBResult } from './clear-all-db';
export type { FlexSearchInstance } from './types.d';

/**
 * Re-export some rxdb helpers
 */
export { isRxDocument, isRxQuery, isRxCollection, isRxDatabase } from 'rxdb';

/**
 * Re-export types
 */
export type {
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
	TemporaryDatabase,
	UserCollection,
	UserDatabase,
	UserDocument,
	WPCredentialsCollection,
	WPCredentialsDocument,
} from './collections';
