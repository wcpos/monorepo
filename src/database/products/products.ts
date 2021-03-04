import schema from './schema.json';

export type ProductSchema = import('./interface').WooCommerceProductSchema;
export type ProductDocument = import('rxdb').RxDocument<ProductSchema, ProductMethods>;
export type ProductCollection = import('rxdb').RxCollection<
	ProductDocument,
	ProductMethods,
	ProductStatics
>;

interface ProductMethods {
	isVariable: (this: ProductDocument) => boolean;
}

type ProductStatics = Record<string, never>;

/**
 *
 */
export const methods: ProductMethods = {
	/**
	 *
	 */
	isVariable(this) {
		return this.type === 'variable';
	},
};

export const products = {
	schema,
	// pouchSettings: {},
	// statics: {},
	methods,
	// attachments: {},
	// options: {},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
