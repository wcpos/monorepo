import schema from './schema.json';

export type TaxRateSchema = import('rxdb').RxJsonSchema<
	import('./interface').WooCommerceTaxRateSchema
>;
export type TaxRateDocument = import('rxdb').RxDocument<TaxRateSchema, TaxRateMethods>;
export type TaxRateCollection = import('rxdb').RxCollection<
	TaxRateDocument,
	TaxRateMethods,
	TaxRateStatics
>;

// @ts-ignore
interface TaxRateMethods {}

type TaxRateStatics = Record<string, never>;

/**
 *
 */
export const methods: TaxRateMethods = {};

export const taxes = {
	schema,
	// pouchSettings: {},
	// statics: {},
	methods,
	// attachments: {},
	// options: {},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
