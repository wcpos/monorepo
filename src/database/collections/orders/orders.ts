import map from 'lodash/map';
import get from 'lodash/get';
import schema from './schema.json';
import methods from './methods';
import statics from './statics';

type BaseColection = import('rxdb').RxCollection;

type OrderMethods = typeof import('./methods');
type OrderStatics = typeof import('./statics');
export type OrderSchema = import('./interface').WooCommerceOrderSchema;
export type OrderDocument = import('rxdb').RxDocument<OrderSchema, OrderMethods>;
export type OrderCollection = import('rxdb').RxCollection<
	OrderDocument,
	OrderMethods,
	OrderStatics & { collections: () => Record<string, import('rxdb').RxCollection> }
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
 * @TODO - how to add collection statics types for ALL collections
 */
async function preInsert(this: OrderCollection, plainData: Record<string, unknown>) {
	if (Array.isArray(plainData.lineItems)) {
		const result = await this.collections().line_items.bulkInsert(plainData.lineItems);
		plainData.lineItems = map(result.success, '_id');
	}
	if (Array.isArray(plainData.feeLines)) {
		const result = await this.collections().fee_lines.bulkInsert(plainData.feeLines);
		plainData.feeLines = map(result.success, '_id');
	}
	if (Array.isArray(plainData.shippingLines)) {
		const result = await this.collections().shipping_lines.bulkInsert(plainData.shippingLines);
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
