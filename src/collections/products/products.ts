import map from 'lodash/map';
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
async function auditVariations(this: ProductCollection, plainData: Record<string, any>) {
	if (plainData.type === 'variable') {
		// insert ids into variations
		const variationsCollection = this.database.collections.variations;
		const documents = map(plainData.variations, (id) =>
			variationsCollection.parseRestResponse({ id: Number(id) })
		);
		variationsCollection.bulkUpsert(documents).catch((err) => {
			console.error(err);
			debugger;
		});
	}
}

/**
 *
 */
export const products = {
	schema,
	// statics,
	// methods,
	// attachments: {},
	options: {
		middlewares: {
			preInsert: {
				handle: auditVariations,
				parallel: false,
			},
			preSave: {
				handle: auditVariations,
				parallel: false,
			},
		},
	},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
