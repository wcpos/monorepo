export { createUserDB } from './users-db';
export { createStoreDB } from './stores-db';
export { createTemporaryDB } from './temporary-db';
export { createFastStoreDB } from './fast-store-db';
export { userCollections, storeCollections, syncCollections } from './collections';
export { clearAllDB } from './clear-all-db';

export type { StoreDatabase } from './stores-db';
export type { UserDatabase } from './users-db';
export type { FastStoreDatabase } from './fast-store-db';

/**
 * Re-export types
 */
export type {
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
	CustomerDocumentType,
	CustomerDocument,
	CustomerCollection,
	TaxRateDocument,
	TaxRateCollection,
	SyncDocument,
	SyncCollection,
	LogCollection,
	LogDocument,
} from './collections';
