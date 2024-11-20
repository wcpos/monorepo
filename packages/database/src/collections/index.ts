import isNaN from 'lodash/isNaN';
import round from 'lodash/round';
import toNumber from 'lodash/toNumber';
import { toTypedRxJsonSchema, ExtractDocumentTypeFromTypedRxJsonSchema, RxJsonSchema } from 'rxdb';

import { categoriesLiteral } from './schemas/categories';
import { customersLiteral } from './schemas/customers';
// import { gatewaysLiteral } from './schemas/gateways';
// import { logsLiteral } from './schemas/logs';
import { logsLiteral } from './schemas/logs';
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

import type { RxCollectionCreator, RxCollection, RxDocument } from 'rxdb';

const roundToSixDecimals = (value: any): number => {
	const num = toNumber(value);
	if (isNaN(num)) return 0;
	return round(num, 6);
};

/**
 * Global Users
 */
const usersTyped = toTypedRxJsonSchema(usersLiteral);
const userSchema: RxJsonSchema<UserDocumentType> = usersLiteral;
type UserDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof usersTyped>;
export type UserDocument = RxDocument<UserDocumentType>;
export type UserCollection = RxCollection<UserDocumentType>;
const users: RxCollectionCreator<UserDocumentType> = { schema: userSchema };

/**
 * Sites
 */
const sitesTyped = toTypedRxJsonSchema(sitesLiteral);
const siteSchema: RxJsonSchema<SiteDocumentType> = sitesLiteral;
type SiteDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof sitesTyped>;
export type SiteDocument = RxDocument<SiteDocumentType>;
export type SiteCollection = RxCollection<SiteDocumentType>;
const sites: RxCollectionCreator<SiteDocumentType> = {
	schema: siteSchema,
	migrationStrategies: {
		1(oldDoc) {
			oldDoc.use_jwt_as_param = false;
			return oldDoc;
		},
	},
};

/**
 * Stores
 */
const storesTyped = toTypedRxJsonSchema(storesLiteral);
const storeSchema: RxJsonSchema<StoreDocumentType> = storesLiteral;
type StoreDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof storesTyped>;
export type StoreDocument = RxDocument<StoreDocumentType>;
export type StoreCollection = RxCollection<StoreDocumentType>;
const stores: RxCollectionCreator<StoreDocumentType> = {
	schema: storeSchema,
	migrationStrategies: {
		1(oldDoc: StoreDocumentType) {
			oldDoc.barcode_scanning_avg_time_input_threshold = 24;
			oldDoc.thousands_group_style = 'thousand';
			const [country, state] = (oldDoc.default_country || '').split(':');
			oldDoc.store_country = country;
			oldDoc.store_state = state;
			return oldDoc;
		},
	},
};

/**
 * WordPress Credientials
 */
const wpCredentialsTyped = toTypedRxJsonSchema(wpCredentialsLiteral);
const wpCredentialsSchema: RxJsonSchema<WPCredentialsDocumentType> = wpCredentialsLiteral;
type WPCredentialsDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof wpCredentialsTyped
>;
export type WPCredentialsDocument = RxDocument<WPCredentialsDocumentType>;
export type WPCredentialsCollection = RxCollection<WPCredentialsDocumentType>;
const wp_credentials: RxCollectionCreator<WPCredentialsDocumentType> = {
	schema: wpCredentialsSchema,
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
const productsTyped = toTypedRxJsonSchema(productsLiteral);
const productSchema: RxJsonSchema<ProductDocumentType> = productsLiteral;
type ProductDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof productsTyped>;
export type ProductDocument = RxDocument<ProductDocumentType>;
export type ProductCollection = RxCollection<ProductDocumentType>;
const products: RxCollectionCreator<ProductDocumentType> = {
	schema: productSchema,
	options: {
		searchFields: ['name', 'sku', 'barcode'],
		middlewares: {
			preInsert: {
				handle: (doc) => {
					doc.sortable_price = roundToSixDecimals(doc.price);
					return doc;
				},
				parallel: false,
			},
			preSave: {
				handle: (doc) => {
					doc.sortable_price = roundToSixDecimals(doc.price);
					return doc;
				},
				parallel: false,
			},
		},
	},
	migrationStrategies: {
		1(oldDoc) {
			oldDoc.sortable_price = roundToSixDecimals(oldDoc.price);
			return oldDoc;
		},
	},
};

/**
 * Product Variations
 */
const variationsTyped = toTypedRxJsonSchema(variationsLiteral);
const productVariationSchema: RxJsonSchema<ProductVariationDocumentType> = variationsLiteral;
type ProductVariationDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof variationsTyped
>;
export type ProductVariationDocument = RxDocument<ProductVariationDocumentType>;
export type ProductVariationCollection = RxCollection<ProductVariationDocumentType>;
const variations: RxCollectionCreator<ProductVariationDocumentType> = {
	schema: productVariationSchema,
	options: {
		searchFields: ['sku', 'barcode'],
		middlewares: {
			preInsert: {
				handle: (doc) => {
					doc.sortable_price = roundToSixDecimals(doc.price);
					return doc;
				},
				parallel: false,
			},
			preSave: {
				handle: (doc) => {
					doc.sortable_price = roundToSixDecimals(doc.price);
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
			oldDoc.sortable_price = roundToSixDecimals(oldDoc.price);
			return oldDoc;
		},
	},
};

/**
 * Product Categories
 */
const categoriesTyped = toTypedRxJsonSchema(categoriesLiteral);
const productCategorySchema: RxJsonSchema<ProductCategoryDocumentType> = categoriesLiteral;
type ProductCategoryDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof categoriesTyped>;
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
	},
};

/**
 * Product Tags
 */
const tagsTyped = toTypedRxJsonSchema(tagsLiteral);
const productTagSchema: RxJsonSchema<ProductTagDocumentType> = tagsLiteral;
type ProductTagDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof tagsTyped>;
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
 * Orders
 */
const ordersTyped = toTypedRxJsonSchema(ordersLiteral);
const orderSchema: RxJsonSchema<OrderDocumentType> = ordersLiteral;
type OrderDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof ordersTyped>;
export type OrderDocument = RxDocument<OrderDocumentType>;
export type OrderCollection = RxCollection<OrderDocumentType>;
const orders: RxCollectionCreator<OrderDocumentType> = {
	schema: orderSchema,
	options: {
		searchFields: ['number', 'billing.first_name', 'billing.last_name', 'billing.email'],
		middlewares: {
			preInsert: {
				handle: (doc) => {
					doc.sortable_total = roundToSixDecimals(doc.total);
					return doc;
				},
				parallel: false,
			},
			preSave: {
				handle: (doc) => {
					doc.sortable_total = roundToSixDecimals(doc.total);
					return doc;
				},
				parallel: false,
			},
		},
	},
	migrationStrategies: {
		1(oldDoc) {
			oldDoc.sortable_total = roundToSixDecimals(oldDoc.total);
			return oldDoc;
		},
	},
};

/**
 * Customers
 */
const customersTyped = toTypedRxJsonSchema(customersLiteral);
const customerSchema: RxJsonSchema<CustomerDocumentType> = customersLiteral;
export type CustomerDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof customersTyped>;
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
	},
};

/**
 * Taxes
 */
const taxSchemaTyped = toTypedRxJsonSchema(taxRatesLiteral);
const taxRateSchema: RxJsonSchema<TaxRateDocumentType> = taxRatesLiteral;
type TaxRateDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof taxSchemaTyped>;
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
const syncTyped = toTypedRxJsonSchema(syncLiteral);
const syncSchema: RxJsonSchema<SyncDocumentType> = syncLiteral;
type SyncDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof syncTyped>;
export type SyncDocument = RxDocument<SyncDocumentType>;
export type SyncCollection = RxCollection<SyncDocumentType>;
const sync: RxCollectionCreator<SyncDocumentType> = { schema: syncSchema };

/**
 * Logs
 */
const logsTyped = toTypedRxJsonSchema(logsLiteral);
const logSchema: RxJsonSchema<LogDocumentType> = logsLiteral;
type LogDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof logsTyped>;
export type LogDocument = RxDocument<LogDocumentType>;
export type LogCollection = RxCollection<LogDocumentType>;
const logs: RxCollectionCreator<LogDocumentType> = { schema: logSchema };

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
	logs: LogCollection;
};

export type SyncCollections = {
	products: SyncCollection;
	variations: SyncCollection;
	orders: SyncCollection;
	customers: SyncCollection;
	taxes: SyncCollection;
	// payment_gateways: GatewayCollection;
	'products/categories': SyncCollection;
	'products/tags': SyncCollection;
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
	logs,
};

// @NOTE: sync collection should have corresponding collections in storeCollections
export const syncCollections = {
	products: sync,
	variations: sync,
	orders: sync,
	customers: sync,
	taxes: sync,
	// payment_gateways: sync,
	'products/categories': sync,
	'products/tags': sync,
};
