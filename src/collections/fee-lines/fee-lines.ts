import schema from './schema.json';

export type FeeLineSchema = import('./interface').WooCommerceOrderFeeLineSchema;
export type FeeLineDocument = import('rxdb').RxDocument<FeeLineSchema, FeeLineMethods>;
export type FeeLineCollection = import('rxdb').RxCollection<
	FeeLineDocument,
	FeeLineMethods,
	FeeLineStatics
>;
type FeeLineMethods = Record<string, never>;
type FeeLineStatics = Record<string, never>;

export const feeLines = {
	schema,
};
