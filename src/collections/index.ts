import { toTypedRxJsonSchema, ExtractDocumentTypeFromTypedRxJsonSchema, RxJsonSchema } from 'rxdb';

import { categoriesLiteral } from './schemas/categories';
import { customersLiteral } from './schemas/customers';
// import { gatewaysLiteral } from './schemas/gateways';
// import { logsLiteral } from './schemas/logs';
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

import type { RxCollectionCreator, RxCollection } from 'rxdb';

/**
 * Global Users
 */
const usersTyped = toTypedRxJsonSchema(usersLiteral);
export const UserSchema: RxJsonSchema<UserDocument> = usersLiteral;
export type UserDocument = ExtractDocumentTypeFromTypedRxJsonSchema<typeof usersTyped>;
export type UserCollection = RxCollection<UserDocument>;
const users: RxCollectionCreator<UserDocument> = { schema: usersLiteral };

/**
 * Sites
 */
const sitesTyped = toTypedRxJsonSchema(sitesLiteral);
export const SiteSchema: RxJsonSchema<SiteDocument> = sitesLiteral;
export type SiteDocument = ExtractDocumentTypeFromTypedRxJsonSchema<typeof sitesTyped>;
export type SiteCollection = RxCollection<SiteDocument>;
const sites: RxCollectionCreator<SiteDocument> = { schema: sitesLiteral };

/**
 * Stores
 */
const storesTyped = toTypedRxJsonSchema(storesLiteral);
export const StoreSchema: RxJsonSchema<StoreDocument> = storesLiteral;
export type StoreDocument = ExtractDocumentTypeFromTypedRxJsonSchema<typeof storesTyped>;
export type StoreCollection = RxCollection<StoreDocument>;
const stores: RxCollectionCreator<StoreDocument> = { schema: storesLiteral };

/**
 * WordPress Credientials
 */
const wpCredentialsTyped = toTypedRxJsonSchema(wpCredentialsLiteral);
export const WPCredentialsSchema: RxJsonSchema<WPCredentialsDocument> = wpCredentialsLiteral;
export type WPCredentialsDocument = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof wpCredentialsTyped
>;
export type WPCredentialsCollection = RxCollection<WPCredentialsDocument>;
const wp_credentials: RxCollectionCreator<WPCredentialsDocument> = { schema: wpCredentialsLiteral };

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
const productsTyped = toTypedRxJsonSchema(productsLiteral);
export const ProductSchema: RxJsonSchema<ProductDocument> = productsLiteral;
export type ProductDocument = ExtractDocumentTypeFromTypedRxJsonSchema<typeof productsTyped>;
export type ProductCollection = RxCollection<ProductDocument>;
const products: RxCollectionCreator<ProductDocument> = {
	schema: productsLiteral,
	options: {
		searchFields: ['name', 'sku', 'barcode'],
	},
};

/**
 * Product Variations
 */
const variationsTyped = toTypedRxJsonSchema(variationsLiteral);
export const ProductVariationSchema: RxJsonSchema<ProductVariationDocument> = variationsLiteral;
export type ProductVariationDocument = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof variationsTyped
>;
export type ProductVariationCollection = RxCollection<ProductVariationDocument>;
const variations: RxCollectionCreator<ProductVariationDocument> = {
	schema: variationsLiteral,
	options: {
		searchFields: ['sku', 'barcode'],
	},
};

/**
 * Product Categories
 */
const categoriesTyped = toTypedRxJsonSchema(categoriesLiteral);
export const ProductCategorySchema: RxJsonSchema<ProductCategoryDocument> = categoriesLiteral;
export type ProductCategoryDocument = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof categoriesTyped
>;
export type ProductCategoryCollection = RxCollection<ProductCategoryDocument>;
const categories: RxCollectionCreator<ProductCategoryDocument> = {
	schema: categoriesLiteral,
	options: {
		searchFields: ['name'],
	},
};

/**
 * Product Tags
 */
const tagsTyped = toTypedRxJsonSchema(tagsLiteral);
export const ProductTagSchema: RxJsonSchema<ProductTagDocument> = tagsLiteral;
export type ProductTagDocument = ExtractDocumentTypeFromTypedRxJsonSchema<typeof tagsTyped>;
export type ProductTagCollection = RxCollection<ProductTagDocument>;
const tags: RxCollectionCreator<ProductTagDocument> = {
	schema: tagsLiteral,
	options: {
		searchFields: ['name'],
	},
};

/**
 * Orders
 */
const ordersTyped = toTypedRxJsonSchema(ordersLiteral);
export const OrderSchema: RxJsonSchema<OrderDocument> = ordersLiteral;
export type OrderDocument = ExtractDocumentTypeFromTypedRxJsonSchema<typeof ordersTyped>;
export type OrderCollection = RxCollection<OrderDocument>;
const orders: RxCollectionCreator<OrderDocument> = {
	schema: ordersLiteral,
	options: {
		searchFields: ['number', 'billing.first_name', 'billing.last_name', 'billing.email'],
	},
};

/**
 * Customers
 */
const customersTyped = toTypedRxJsonSchema(customersLiteral);
export const CustomerSchema: RxJsonSchema<CustomerDocument> = customersLiteral;
export type CustomerDocument = ExtractDocumentTypeFromTypedRxJsonSchema<typeof customersTyped>;
export type CustomerCollection = RxCollection<CustomerDocument>;
const customers: RxCollectionCreator<CustomerDocument> = {
	schema: customersLiteral,
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
};

/**
 * Taxes
 */
const taxSchemaTyped = toTypedRxJsonSchema(taxRatesLiteral);
export const TaxRateSchema: RxJsonSchema<TaxRateDocument> = taxRatesLiteral;
export type TaxRateDocument = ExtractDocumentTypeFromTypedRxJsonSchema<typeof taxSchemaTyped>;
export type TaxRateCollection = RxCollection<TaxRateDocument>;
const taxes: RxCollectionCreator<TaxRateDocument> = { schema: taxRatesLiteral };

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
const syncTyped = toTypedRxJsonSchema(syncLiteral);
export const SyncSchema: RxJsonSchema<SyncDocument> = syncLiteral;
export type SyncDocument = ExtractDocumentTypeFromTypedRxJsonSchema<typeof syncTyped>;
export type SyncCollection = RxCollection<SyncDocument>;
const sync: RxCollectionCreator<SyncDocument> = { schema: syncLiteral };

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
	taxes: TaxRateCollection;
	// payment_gateways: GatewayCollection;
	'products/categories': ProductCategoryCollection;
	'products/tags': ProductTagCollection;
	sync: SyncCollection;
};

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
	taxes, // NOTE: WC REST API uses 'taxes', not 'tax_rates', going against all other endpoints.
	// payment_gateways,
	'products/categories': categories, // NOTE: WC REST API uses 'products/categories' endpoint
	'products/tags': tags, // NOTE: WC REST API uses 'products/tags' endpoint
	sync, // for remote sync data
};
