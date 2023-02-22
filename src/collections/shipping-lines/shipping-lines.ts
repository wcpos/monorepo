import schema from './schema.json';

export type ShippingLineSchema = import('./interface').WooCommerceOrderShippingLineSchema;
export type ShippingLineDocument = import('rxdb').RxDocument<
	ShippingLineSchema,
	ShippingLineMethods
>;
export type ShippingLineCollection = import('rxdb').RxCollection<
	ShippingLineDocument,
	ShippingLineMethods,
	ShippingLineStatics
>;
type ShippingLineMethods = Record<string, never>;
type ShippingLineStatics = Record<string, never>;

export const shippingLines = {
	schema,
};
