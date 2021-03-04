import map from 'lodash/map';
import isString from 'lodash/isString';
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
	async preInsertLineItems(this: OrderCollection, plainData: Record<string, unknown>, db: any) {
		debugger;
		const result = await db.lineItems.bulkInsert(plainData.line_items);
		plainData.line_items = map(result.success, 'id').filter((id) => isString(id));
	},

	/**
	 *
	 */
	preInsertFeeLines(this: OrderCollection, plainData: any[]) {
		debugger;
	},

	/**
	 *
	 */
	preInsertShippingLines(this: OrderCollection, plainData: any[]) {
		debugger;
	},
};

export const orders = {
	schema,
	// pouchSettings: {},
	statics,
	methods,
	// attachments: {},
	// options: {},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
