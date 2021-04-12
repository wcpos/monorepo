import map from 'lodash/map';
import get from 'lodash/get';
import schema from './schema.json';
import methods from './methods';

type OrderMethods = typeof import('./methods');
export type OrderSchema = import('./interface').WooCommerceOrderSchema;
export type OrderDocument = import('rxdb').RxDocument<OrderSchema, OrderMethods>;
export type OrderCollection = import('rxdb').RxCollection<
	OrderDocument,
	OrderMethods,
	OrderStatics
>;

// interface OrderMethods {}

interface OrderStatics {}

/**
 *
 */
export const statics: OrderStatics = {
	/**
	 *
	 */
	async preInsertLineItems(this: OrderCollection, plainData: Record<string, unknown>) {
		const lineItemsCollection = get(this, 'database.collections.line_items');
		const result = await lineItemsCollection.bulkInsert(plainData.lineItems);
		plainData.lineItems = map(result.success, '_id');
	},

	/**
	 *
	 */
	async preInsertFeeLines(this: OrderCollection, plainData: Record<string, unknown>) {
		const feeLinesCollection = get(this, 'database.collections.fee_lines');
		const result = await feeLinesCollection.bulkInsert(plainData.feeLines);
		plainData.feeLines = map(result.success, '_id');
	},

	/**
	 *
	 */
	async preInsertShippingLines(this: OrderCollection, plainData: Record<string, unknown>) {
		const shippingLinesCollection = get(this, 'database.collections.shipping_lines');
		const result = await shippingLinesCollection.bulkInsert(plainData.shippingLines);
		plainData.shippingLines = map(result.success, '_id');
	},
};

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
		},
	},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
