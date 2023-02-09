import schema from './schema.json';

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
export const products = {
	schema,
};
