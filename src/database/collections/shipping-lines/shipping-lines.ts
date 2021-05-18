import { map } from 'rxjs/operators';
import schema from './schema.json';
import { calcTaxes, sumTaxes } from '../utils';

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
	computedTaxes$(this: ShippingLineDocument) {
		// @ts-ignore
		return this.total$.pipe(map((total) => calcTaxes(total, taxRates)));
	},

	/**
	 *
	 */
	computedTotalTax$(this: ShippingLineDocument) {
		// @ts-ignore
		return this.computedTaxes$().pipe(map((taxes) => sumTaxes(taxes)));
	},
};

export const shippingLines = {
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
