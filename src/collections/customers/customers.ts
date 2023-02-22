import schema from './schema.json';

export type CustomerSchema = import('./interface').WooCommerceCustomerSchema;
export type CustomerDocument = import('rxdb').RxDocument<CustomerSchema, CustomerMethods>;
export type CustomerCollection = import('rxdb').RxCollection<
	CustomerDocument,
	CustomerMethods,
	CustomerStatics
>;

type CustomerStatics = Record<string, never>;
type CustomerMethods = Record<string, never>;

export const customers = {
	schema,
};
