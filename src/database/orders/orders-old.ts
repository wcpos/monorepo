import unset from 'lodash/unset';
import map from 'lodash/map';
import isString from 'lodash/isString';
import schema from './schema.json';
import methods from './methods';
import statics from './statics';
import postCreate from './postCreate';
import createOrderLineItemsCollection from './line-items';
import createOrderFeeLinesCollection from './fee-lines';
import createOrderShippingLinesCollection from '../shipping-lines';

type StoreDatabase = import('../../types').StoreDatabase;
type OrderCollection = import('../../types').OrderCollection;
type OrderDocument = import('../../types').OrderDocument;
type Order = import('../../woocommerce-types').Order;

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

	// create sub-collections first
	await createOrderLineItemsCollection(db);
	await createOrderFeeLinesCollection(db);
	await createOrderShippingLinesCollection(db);

	collections.orders.preInsert(async (plainData: Order): Promise<void> => {
		// remove _links property (invalid property name)
		unset(plainData, '_links');

		// @TODO - have this as part of validation??
		// @ts-ignore
		plainData.id = String(plainData.id);

		// extract ids from line_items, fee_lines and shipping_lines
		// @TODO = what to do about updates from server, there will be id conflict
		if (Array.isArray(plainData.line_items)) {
			// @ts-ignore
			const result1 = await db.collections.line_items.bulkInsert(plainData.line_items);
			// @ts-ignore
			plainData.line_items = map(result1.success, 'id').filter((id) => isString(id));
		}
		if (Array.isArray(plainData.fee_lines)) {
			// @ts-ignore
			const result2 = await db.collections.fee_lines.bulkInsert(plainData.fee_lines);
			// @ts-ignore
			plainData.fee_lines = map(result2.success, 'id').filter((id) => isString(id));
		}
		if (Array.isArray(plainData.shipping_lines)) {
			// @ts-ignore
			const result3 = await db.collections.shipping_lines.bulkInsert(plainData.shipping_lines);
			// @ts-ignore
			plainData.shipping_lines = map(result3.success, 'id').filter((id) => isString(id));
		}
	}, false);

	collections.orders.postCreate(postCreate);

	// @ts-ignore
	return collections.orders;
};

export default createOrdersCollection;
