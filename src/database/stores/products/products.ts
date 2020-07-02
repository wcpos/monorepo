import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import schema from './schema.json';

export type Schema = import('./interface').WooCommercePOSStoreSchema;
export type Methods = {};
export type Model = import('rxdb').RxDocument<Schema, Methods>;
export type Statics = {};
export type Collection = import('rxdb').RxCollection<Model, Methods, Statics>;
type Database = import('../../database').Database;

/**
 * WooCommerce Product Model methods
 */
const methods: Methods = {};

/**
 * WooCommerce Product Collection methods
 */
const statics: Statics = {};

/**
 *
 * @param db
 */
const createProductsCollection = async (db: Database): Promise<Collection> => {
	const ProductsCollection = await db.collection({
		name: 'products',
		schema,
		methods,
		statics,
	});

	// ProductsCollection.postCreate((raw, model) => {
	// 	const dbResource = new ObservableResource(
	// 		from(
	// 			getDatabase(model.id).then((db) => {
	// 				console.log(db);
	// 			})
	// 		)
	// 	);
	// 	Object.defineProperty(model, 'dbResource', {
	// 		get: () => dbResource,
	// 	});
	// });

	return ProductsCollection;
};

export default createProductsCollection;
