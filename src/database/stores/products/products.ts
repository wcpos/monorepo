import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import difference from 'lodash/difference';
import unset from 'lodash/unset';
import schema from './schema.json';
import methods from './methods';
import statics from './statics';

type StoreDatabase = import('../../types').StoreDatabase;

/**
 *
 * @param db
 */
const createProductsCollection = async (db: StoreDatabase) => {
	const collections = await db.addCollections({
		products: {
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

	collections.products.preInsert((rawData: Record<string, unknown>) => {
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

	return collections.products;
};

export default createProductsCollection;
