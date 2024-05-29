export { createUserDB } from './users-db';
export { createStoreDB } from './stores-db';
export { createTemporaryDB } from './temporary-db';
export { userCollections, storeCollections } from './collections';
export { clearAllDB } from './clear-all-db';

export type { StoreDatabase } from './stores-db';
export type { UserDatabase } from './users-db';

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
} from './collections';
