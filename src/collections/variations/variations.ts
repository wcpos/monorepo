import schema from './schema.json';

export type ProductVariationSchema = import('./interface').WooCommerceProductVariationSchema;
export type ProductVariationDocument = import('rxdb').RxDocument<
	ProductVariationSchema,
	ProductVariationMethods
>;
export type ProductVariationCollection = import('rxdb').RxCollection<
	ProductVariationDocument,
	ProductVariationMethods,
	ProductVariationStatics
>;
type ProductVariationMethods = Record<string, never>;
type ProductVariationStatics = Record<string, never>;

export const productVariations = {
	schema,
	// statics: {},
	// methods: {},
	// attachments: {},
	// options: {},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
