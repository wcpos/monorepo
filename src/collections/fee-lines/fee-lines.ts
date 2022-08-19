import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import schema from './schema.json';
import { calcTaxes, sumTaxes, sumItemizedTaxes } from '../utils';
import statics from './statics';

export type FeeLineSchema = import('./interface').WooCommerceOrderFeeLineSchema;
export type FeeLineDocument = import('rxdb').RxDocument<FeeLineSchema, FeeLineMethods>;
export type FeeLineCollection = import('rxdb').RxCollection<
	FeeLineDocument,
	FeeLineMethods,
	FeeLineStatics
>;
type FeeLineMethods = Record<string, never>;
type FeeLineStatics = Record<string, never>;

const rates: any[] = [
	{
		id: 2,
		country: 'GB',
		rate: '20.0000',
		name: 'VAT',
		priority: 1,
		compound: true,
		shipping: true,
		order: 1,
		class: 'standard',
	},
];

/**
 *
 */
export function postCreate(
	this: FeeLineCollection,
	plainData: Record<string, unknown>,
	feeLine: FeeLineDocument
) {
	/**
	 * add changes for taxes
	 */
	combineLatest([feeLine.total$]).subscribe((array) => {
		const [total = 0] = array;
		const discounts = 0;
		// const total = subtotal - discounts;
		// @ts-ignore note: total is a string
		const totalTaxes = calcTaxes(+total, rates);
		const taxes = sumItemizedTaxes(totalTaxes);

		// fee has a subtotal?
		feeLine.atomicPatch({
			totalTax: String(sumTaxes(totalTaxes)),
			taxes,
		});
	});
}

export const feeLines = {
	schema,
	// statics,
	// methods: {},
	// attachments: {},
	options: {
		// middlewares: {
		// 	postCreate: {
		// 		handle: postCreate,
		// 		parallel: false,
		// 	},
		// },
	},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
