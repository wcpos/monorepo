import methods from './methods';
import schema from './schema.json';
import statics from './statics';

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
export const orders = {
	schema,
	// statics,
	// methods,
	options: {
		// middlewares: {
		// postCreate: {
		// 	handle: postCreate,
		// 	parallel: false,
		// },
		// preInsert: {
		// 	handle: preInsert,
		// 	parallel: false,
		// },
		// preSave: {
		// 	handle: preSave,
		// 	parallel: false,
		// },
		// preRemove: {
		// 	handle: preRemove,
		// 	parallel: false,
		// },
		// },
	},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
