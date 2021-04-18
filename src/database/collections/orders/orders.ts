import map from 'lodash/map';
import get from 'lodash/get';
import isArray from 'lodash/isArray';
import isString from 'lodash/isString';
import find from 'lodash/find';
import forEach from 'lodash/forEach';
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
	if (isArray(plainData.lineItems)) {
		const result = await this.collections().line_items.bulkInsert(plainData.lineItems);
		debugger;
		plainData.lineItems = map(result.success, '_id');
	}
	if (isArray(plainData.feeLines)) {
		const result = await this.collections().fee_lines.bulkInsert(plainData.feeLines);
		plainData.feeLines = map(result.success, '_id');
	}
	if (isArray(plainData.shippingLines)) {
		const result = await this.collections().shipping_lines.bulkInsert(plainData.shippingLines);
		plainData.shippingLines = map(result.success, '_id');
	}
	return plainData;
}

/**
 *
 */
// @ts-ignore
async function preSave(
	this: OrderCollection,
	plainData: Record<string, unknown>,
	order: OrderDocument
) {
	// @TODO - bulkInsert should match bulkInsert, eg: result.success
	const { lineItems, feeLines, shippingLines } = plainData;
	if (isArray(lineItems) && lineItems.length > 0 && !isString(lineItems[0])) {
		const result = await this.collections().line_items.bulkUpsert(lineItems);
		debugger;
		plainData.lineItems = map(result, '_id');
	}
	if (isArray(feeLines) && feeLines.length > 0 && !isString(feeLines[0])) {
		const result = await this.collections().fee_lines.bulkUpsert(feeLines);
		plainData.feeLines = map(result, '_id');
	}
	if (isArray(shippingLines) && shippingLines.length > 0 && !isString(shippingLines[0])) {
		const result = await this.collections().shipping_lines.bulkUpsert(shippingLines);
		plainData.shippingLines = map(result, '_id');
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
			preSave: {
				handle: preSave,
				parallel: false,
			},
		},
	},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
