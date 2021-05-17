import { from, of, combineLatest, Observable } from 'rxjs';
import { switchMap, tap, catchError, map, filter } from 'rxjs/operators';
// import _orderBy from 'lodash/orderBy';
// import _filter from 'lodash/filter';
// import _sumBy from 'lodash/sumBy';
// import _isArray from 'lodash/isArray';
// import _map from 'lodash/map';
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

const taxes = [
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

function calcInclusiveTax(price) {}

function calcTaxes(price) {
	return calcInclusiveTax(price);
}

const methods = {
	/**
	 *
	 */
	computedTaxes$(this: FeeLineDocument) {
		// @ts-ignore
		return this.total$.pipe(tap((total) => calculateTaxes(total)));
	},

	/**
	 *
	 */
	computedTotalTax$(this: FeeLineDocument) {
		// @ts-ignore
		return this.taxes$.pipe(
			map((result) => {
				return result ?? 0;
			})
		);
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
