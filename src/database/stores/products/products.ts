import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import difference from 'lodash/difference';
import unset from 'lodash/unset';
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
const methods: Methods = {
	/**
	 *
	 */
	isVariable() {
		return this.type === 'variable';
	},
};

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

	// @TODO - turn this into a plugin?
	ProductsCollection.preInsert(function (rawData) {
		// remove _links property (invalid property name)
		unset(rawData, '_links');
		// remove propeties not on schema
		const omitProperties = difference(Object.keys(rawData), this.schema.topLevelFields);
		console.log('the following properties are being omiited', omitProperties);
		omitProperties.forEach((prop) => {
			unset(rawData, prop);
		});
		// change id to string
		rawData.id = String(rawData.id);
	}, false);

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
