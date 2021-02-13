import schema from './schema.json';
import methods from './methods';
import statics from './statics';
import preInsert from './preInsert';
import postInsert from './postInsert';
import postCreate from './postCreate';
import createOrderLineItemsCollection from './line-items';
import createOrderFeeLinesCollection from './fee-lines';
import createOrderShippingLinesCollection from './shipping-lines';

export type Schema = import('./interface').WooCommerceOrderSchema;
export type Methods = {};
export type Model = import('rxdb').RxDocument<Schema, Methods>;
export type Statics = {};
export type Collection = import('rxdb').RxCollection<Model, Methods, Statics>;
type Database = import('../../database').Database;

/**
 *
 * @param db
 */
// const createOrdersCollection = async (db: Database): Promise<Collection> => {
const createOrdersCollection = async (db) => {
	const collections = await db.addCollections({
		orders: {
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

	collections.orders.preInsert(preInsert, false);
	collections.orders.postInsert(postInsert, false);
	collections.orders.postCreate(postCreate);

	await createOrderLineItemsCollection(db);
	await createOrderFeeLinesCollection(db);
	await createOrderShippingLinesCollection(db);

	return collections.orders;
};

export default createOrdersCollection;
