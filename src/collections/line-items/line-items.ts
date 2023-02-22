import schema from './schema.json';

export type LineItemSchema = import('./interface').WooCommerceOrderLineItemSchema;
export type LineItemDocument = import('rxdb').RxDocument<LineItemSchema, LineItemMethods>;
export type LineItemCollection = import('rxdb').RxCollection<
	LineItemDocument,
	LineItemMethods,
	LineItemStatics
>;

type LineItemMethods = Record<string, never>;
type LineItemStatics = Record<string, never>;

export const lineItems = {
	schema,
};
