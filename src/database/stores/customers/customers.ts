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
};

/**
 * WooCommerce Product Collection methods
 */
const statics: Statics = {
	/**
	 *
	 */
};

/**
 *
 * @param db
 */
const createOrdersCollection = async (db: Database): Promise<Collection> => {
	const OrdersCollection = await db.collection({
		name: 'customers',
		schema,
		methods,
		statics,
	});

	// @TODO - turn this into a plugin?
	OrdersCollection.preInsert(function (rawData) {
		// remove _links property (invalid property name)
		unset(rawData, '_links');

		// remove propeties not on schema
		const omitProperties = difference(Object.keys(rawData), this.schema.topLevelFields);
		if (omitProperties.length > 0) {
			console.log('the following properties are being omiited', omitProperties);
			omitProperties.forEach((prop) => {
				unset(rawData, prop);
			});
		}

		// change id to string
		rawData.id = String(rawData.id);
	}, false);

	// OrdersCollection.postCreate((raw, model) => {
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

	return OrdersCollection;
};

export default createOrdersCollection;
