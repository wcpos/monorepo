import schema from './schema.json';

export type ProductCategorySchema = import('./interface').WooCommerceProductCategorySchema;
export type ProductCategoryDocument = import('rxdb').RxDocument<
	ProductCategorySchema,
	ProductCategoryMethods
>;
export type ProductCategoryCollection = import('rxdb').RxCollection<
	ProductCategoryDocument,
	ProductCategoryMethods,
	ProductCategoryStatics
>;

type ProductCategoryStatics = Record<string, never>;
type ProductCategoryMethods = Record<string, never>;

export const categories = {
	schema,
};
