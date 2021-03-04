import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import difference from 'lodash/difference';
import unset from 'lodash/unset';
import schema from './schema.json';

type StoreDatabase = import('../../types').StoreDatabase;

/**
 * WooCommerce Product Model methods
 */
export const methods = {
	/**
	 *
	 */
};

/**
 * WooCommerce Product Collection methods
 */
export const statics = {
	/**
	 *
	 */
};

/**
 *
 * @param db
 */
const createOrdersCollection = async (db: StoreDatabase) => {
	const collections = await db.addCollections({
		customers: {
			schema,
			// pouchSettings: {},
			statics,
			methods,
			// attachments: {},
			// options: {},
			// migrationStrategies: {},
			// autoMigrate: true,
			// cacheReplacementPolicy() {},
		},
	});

	// @TODO - turn this into a plugin?
	collections.customers.preInsert((rawData: Record<string, unknown>) => {
		// remove _links property (invalid property name)
		unset(rawData, '_links');

		// remove propeties not on schema
		// const omitProperties = difference(Object.keys(rawData), this.schema.topLevelFields);
		// if (omitProperties.length > 0) {
		// 	console.log('the following properties are being omiited', omitProperties);
		// 	omitProperties.forEach((prop) => {
		// 		unset(rawData, prop);
		// 	});
		// }

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

	return collections.customers;
};

export default createOrdersCollection;
