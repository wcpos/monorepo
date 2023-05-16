/**
 * User Collections
 */
export type { LogCollection, LogDocument, LogSchema } from './collections/logs';
export type { UserCollection, UserDocument, UserSchema } from './collections/users';
export type { SiteCollection, SiteDocument, SiteSchema } from './collections/sites';
export type {
	WPCredentialsCollection,
	WPCredentialsDocument,
	WPCredentialsSchema,
} from './collections/wp-credentials';
export type { StoreCollection, StoreDocument, StoreSchema } from './collections/stores';

/**
 * Store Collections
 */
export type { OrderCollection, OrderDocument, OrderSchema } from './collections/orders';
export type { ProductCollection, ProductDocument, ProductSchema } from './collections/products';
export type {
	LineItemCollection,
	LineItemDocument,
	LineItemSchema,
} from './collections/line-items';
export type { FeeLineCollection, FeeLineDocument, FeeLineSchema } from './collections/fee-lines';
export type {
	ShippingLineCollection,
	ShippingLineDocument,
	ShippingLineSchema,
} from './collections/shipping-lines';
export type { CustomerCollection, CustomerDocument, CustomerSchema } from './collections/customers';
export type { TaxRateCollection, TaxRateDocument, TaxRateSchema } from './collections/tax-rates';
export type {
	ProductVariationCollection,
	ProductVariationDocument,
	ProductVariationSchema,
} from './collections/variations';
export type {
	ProductCategoryCollection,
	ProductCategoryDocument,
	ProductCategorySchema,
} from './collections/categories';
export type {
	ProductTagCollection,
	ProductTagDocument,
	ProductTagSchema,
} from './collections/tags';

export type { UserDatabase, UserDatabaseCollections } from './users-db';
export type { StoreDatabase, StoreDatabaseCollections } from './stores-db';

export { createUserDB, removeUserDB, addUserDBCollection } from './users-db';
export { createStoreDB, removeStoreDB, addStoreDBCollection } from './stores-db';
export { createTemporaryDB } from './temporary-db';
export { removeDB } from './create-db';
