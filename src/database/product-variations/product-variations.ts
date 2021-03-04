import schema from './schema.json';

export type ProductVariationsSchema = import('./interface').WooCommerceProductVariationSchema;
export type ProductVariationsDocument = import('rxdb').RxDocument<
	ProductVariationsSchema,
	ProductVariationsMethods
>;
export type ProductVariationsCollection = import('rxdb').RxCollection<
	ProductVariationsDocument,
	ProductVariationsMethods,
	ProductVariationsStatics
>;
type ProductVariationsMethods = Record<string, never>;
type ProductVariationsStatics = Record<string, never>;

export const productVariations = {
	schema,
	// pouchSettings: {},
	// statics: {},
	// methods: {},
	// attachments: {},
	// options: {},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
