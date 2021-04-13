import map from 'lodash/map';
import get from 'lodash/get';
import schema from './schema.json';
import methods from './methods';
import statics from './statics';

type OrderMethods = typeof import('./methods');
type OrderStatics = typeof import('./statics');
export type OrderSchema = import('./interface').WooCommerceOrderSchema;
export type OrderDocument = import('rxdb').RxDocument<OrderSchema, OrderMethods>;
export type OrderCollection = import('rxdb').RxCollection<
	OrderDocument,
	OrderMethods,
	OrderStatics
>;

/**
 *
 */
function postCreate(
	this: OrderCollection,
	plainData: Record<string, unknown>,
	orderDocument: OrderDocument
) {
	console.log('watch lineItems');
}

/**
 *
 */
async function preInsert(this: OrderCollection, plainData: Record<string, unknown>) {
	if (plainData.lineItems) {
		const lineItemsCollection = get(this, 'database.collections.line_items');
		const result = await lineItemsCollection.bulkInsert(plainData.lineItems);
		plainData.lineItems = map(result.success, '_id');
	}
	if (plainData.feeLines) {
		const feeLinesCollection = get(this, 'database.collections.fee_lines');
		const result = await feeLinesCollection.bulkInsert(plainData.feeLines);
		plainData.feeLines = map(result.success, '_id');
	}
	if (plainData.shippingLines) {
		const shippingLinesCollection = get(this, 'database.collections.shipping_lines');
		const result = await shippingLinesCollection.bulkInsert(plainData.shippingLines);
		plainData.shippingLines = map(result.success, '_id');
	}
	return plainData;
}

/**
 *
 */
export const orders = {
	schema,
	// pouchSettings: {},
	statics,
	methods,
	// attachments: {},
	options: {
		middlewares: {
			postCreate: {
				handle: postCreate,
				parallel: false,
			},
			preInsert: {
				handle: preInsert,
				parallel: false,
			},
		},
	},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
