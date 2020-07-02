import { ObservableResource } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';
import schema from './schema.json';

export type Schema = import('./interface').WooCommercePOSStoreSchema;
export type Methods = {};
export type Model = import('rxdb').RxDocument<Schema, Methods>;
export type Statics = {};
export type Collection = import('rxdb').RxCollection<Model, Methods, Statics>;
type Database = import('../../database').Database;

/**
 * WordPress User Model methods
 */
const methods: Methods = {};

/**
 * WordPress User Collection methods
 */
const statics: Statics = {};

/**
 *
 * @param db
 */
const createStoresCollection = async (db: Database): Promise<Collection> => {
	const StoresCollection = await db.collection({
		name: 'stores',
		schema,
		methods,
		statics,
	});

	// StoresCollection.postCreate((plainData, rxDocument) => {

	// });

	return StoresCollection;
};

export default createStoresCollection;
