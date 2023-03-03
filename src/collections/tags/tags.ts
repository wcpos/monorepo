import schema from './schema.json';

export type ProductTagSchema = import('./interface').WooCommerceProductTagSchema;
export type ProductTagDocument = import('rxdb').RxDocument<ProductTagSchema, ProductTagMethods>;
export type ProductTagCollection = import('rxdb').RxCollection<
	ProductTagDocument,
	ProductTagMethods,
	ProductTagStatics
>;

type ProductTagStatics = Record<string, never>;
type ProductTagMethods = Record<string, never>;

export const tags = {
	schema,
};
