import map from 'lodash/map';
import get from 'lodash/get';
import isArray from 'lodash/isArray';
import isString from 'lodash/isString';
import find from 'lodash/find';
import forEach from 'lodash/forEach';
import schema from './schema.json';
import methods from './methods';
import statics from './statics';
import postCreate from './postCreate';

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
	// pouchSettings: {},
	statics,
	methods,
	// methods: {
	// 	whoAmI() {
	// 		debugger;
	// 		return `I am ${this.name}!!`;
	// 	},
	// },
	// attachments: {},
	options: {
		middlewares: {
			postCreate: {
				handle: postCreate,
				parallel: false,
			},
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
		},
	},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
