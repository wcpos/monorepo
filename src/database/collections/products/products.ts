import schema from './schema.json';
import statics from './statics';

export type ProductSchema = import('./interface').WooCommerceProductSchema;
export type ProductDocument = import('rxdb').RxDocument<ProductSchema, ProductMethods>;
export type ProductCollection = import('rxdb').RxCollection<
	ProductDocument,
	ProductMethods,
	ProductStatics
>;

interface ProductMethods {
	isVariable: (this: ProductDocument) => boolean;
	// isSynced: (this: ProductDocument) => boolean;
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
	/**
	 *
	 */
	// isSynced(this) {
	// 	return !!this.dateModifiedGmt;
	// },
};

/**
 *
 */
async function preInsert(this: ProductCollection, plainData: Record<string, any>) {
	// totalSales is meant to be interger, but comes as string
	const { totalSales } = plainData;
	if (totalSales) {
		plainData.totalSales = parseFloat(totalSales);
	}

	return plainData;
}

/**
 *
 */
async function preSave(
	this: ProductCollection,
	plainData: Record<string, any>,
	product: ProductDocument
) {
	// totalSales is meant to be interger, but comes as string
	const { totalSales } = plainData;
	if (totalSales) {
		plainData.totalSales = parseFloat(totalSales);
	}

	return plainData;
}

export const products = {
	schema,
	// pouchSettings: {},
	statics,
	methods,
	// attachments: {},
	options: {
		middlewares: {
			preInsert: {
				handle: preInsert,
				parallel: false,
			},
			preSave: {
				handle: preSave,
				parallel: false,
			},
		},
	},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
