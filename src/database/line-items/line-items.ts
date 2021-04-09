import schema from './schema.json';
import statics from './statics';

export type LineItemSchema = import('./interface').WooCommerceOrderLineItemSchema;
export type LineItemDocument = import('rxdb').RxDocument<LineItemSchema, LineItemMethods>;
export type LineItemCollection = import('rxdb').RxCollection<
	LineItemDocument,
	LineItemMethods,
	LineItemStatics
>;
type LineItemMethods = Record<string, never>;
type LineItemStatics = typeof import('./statics');

export const lineItems = {
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
