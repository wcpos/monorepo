import schema from './schema.json';

type RxCollectionCreator = import('rxdb').RxCollectionCreator;

export type ProductSchema = import('./interface').WooCommerceProductSchema;
export type ProductDocument = import('rxdb').RxDocument<ProductSchema, ProductMethods>;
export type ProductCollection = import('rxdb').RxCollection<
	ProductDocument,
	ProductMethods,
	ProductStatics
>;

type ProductStatics = Record<string, never>;
type ProductMethods = Record<string, never>;

/**
 *
 */
export const products: RxCollectionCreator = {
	schema,
	localDocuments: true, // needed for custom checkpoint
	migrationStrategies: {
		1: (oldDoc: any) => {
			return null; // nuke old data
		},
	},
	options: {
		searchFields: ['name', 'sku', 'barcode'],
	},
};
