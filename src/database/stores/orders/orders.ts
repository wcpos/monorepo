import schema from './schema.json';
import methods from './methods';
import statics from './statics';
import preInsert from './preInsert';
import postInsert from './postInsert';
import postCreate from './postCreate';
import createOrderLineItemsCollection from './line-items';
import createOrderFeeLinesCollection from './fee-lines';
import createOrderShippingLinesCollection from './shipping-lines';

type StoreDatabase = import('../../types').StoreDatabase;
type OrderCollection = import('../../types').OrderCollection;

/**
 *
 * @param db
 */
const createOrdersCollection = async (db: StoreDatabase): Promise<OrderCollection> => {
	// const createOrdersCollection = async (db) => {
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

	// @ts-ignore
	return collections.orders;
};

export default createOrdersCollection;
