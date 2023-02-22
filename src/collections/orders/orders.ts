import schema from './schema.json';

export type OrderSchema = import('./interface').WooCommerceOrderSchema;
export type OrderDocument = import('rxdb').RxDocument<OrderSchema, OrderMethods>;
export type OrderCollection = import('rxdb').RxCollection<
	OrderDocument,
	OrderMethods,
	OrderStatics
>;

type OrderMethods = Record<string, never>;
type OrderStatics = Record<string, never>;

/**
 *
 */
export const orders = {
	schema,
};
