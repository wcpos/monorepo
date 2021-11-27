import schema from './schema.json';
import statics from './statics';

export type CustomerSchema = import('rxdb').RxJsonSchema<
	import('./interface').WooCommerceCustomerSchema
>;
export type CustomerDocument = import('rxdb').RxDocument<CustomerSchema, CustomerMethods>;
export type CustomerCollection = import('rxdb').RxCollection<
	CustomerDocument,
	CustomerMethods,
	CustomerStatics
>;

// interface CustomerMethods {}

type CustomerStatics = Record<string, never>;
type CustomerMethods = Record<string, never>;

// /**
//  *
//  */
// export const methods: CustomerMethods = {};

export const customers = {
	schema,
	// pouchSettings: {},
	statics,
	// methods: {},
	// attachments: {},
	// options: {},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
