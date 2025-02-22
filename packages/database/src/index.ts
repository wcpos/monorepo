import './plugins';

export { createUserDB, createStoreDB, createTemporaryDB, createFastStoreDB } from './create-db';
export { userCollections, storeCollections, syncCollections } from './collections';
export { clearAllDB } from './clear-all-db';

/**
 * Re-export some rxdb helpers
 */
export { isRxDocument, isRxQuery, isRxCollection, isRxDatabase } from 'rxdb';

/**
 * Re-export types
 */
export type {
	UserDatabase,
	StoreDatabase,
	SyncDatabase,
	TemporaryDatabase,
	UserDocument,
	UserCollection,
	SiteDocument,
	SiteCollection,
	StoreDocument,
	StoreCollection,
	StoreCollections,
	WPCredentialsDocument,
	WPCredentialsCollection,
	ProductDocument,
	ProductCollection,
	ProductCategoryDocument,
	ProductCategoryCollection,
	ProductTagDocument,
	ProductTagCollection,
	ProductVariationDocument,
	ProductVariationCollection,
	OrderDocument,
	OrderCollection,
	CustomerDocument,
	CustomerCollection,
	TaxRateDocument,
	TaxRateCollection,
	SyncDocument,
	SyncCollection,
	LogCollection,
	LogDocument,
} from './collections';
