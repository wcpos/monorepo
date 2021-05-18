import { map } from 'rxjs/operators';
import schema from './schema.json';
import { calcTaxes, sumTaxes } from '../utils';

export type FeeLineSchema = import('./interface').WooCommerceOrderFeeLineSchema;
export type FeeLineDocument = import('rxdb').RxDocument<FeeLineSchema, FeeLineMethods>;
export type FeeLineCollection = import('rxdb').RxCollection<
	FeeLineDocument,
	FeeLineMethods,
	FeeLineStatics
>;
type FeeLineMethods = Record<string, never>;
type FeeLineStatics = Record<string, never>;

const taxRates = [
	{
		id: 72,
		country: 'US',
		state: 'AL',
		postcode: '35041',
		city: 'Cardiff',
		postcodes: ['35014', '35036', '35041'],
		cities: ['Alpine', 'Brookside', 'Cardiff'],
		rate: '4.0000',
		name: 'State Tax',
		priority: 0,
		compound: false,
		shipping: false,
		order: 1,
		class: 'standard',
	},
];

const methods = {
	/**
	 *
	 */
	computedTaxes$(this: FeeLineDocument) {
		// @ts-ignore
		return this.total$.pipe(map((total) => calcTaxes(total, taxRates)));
	},

	/**
	 *
	 */
	computedTotalTax$(this: FeeLineDocument) {
		// @ts-ignore
		return this.computedTaxes$().pipe(map((taxes) => sumTaxes(taxes)));
	},
};

export const feeLines = {
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
