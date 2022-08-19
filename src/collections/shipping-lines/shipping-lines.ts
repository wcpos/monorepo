import { from, combineLatest, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import _filter from 'lodash/filter';
import schema from './schema.json';
import { calcTaxes, sumTaxes, sumItemizedTaxes } from '../utils';
import statics from './statics';

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
	this: ShippingLineCollection,
	plainData: Record<string, unknown>,
	shippingLine: ShippingLineDocument
) {
	/**
	 * add changes for taxes
	 */
	combineLatest([shippingLine.total$]).subscribe((array) => {
		const [total = 0] = array;
		const discounts = 0;
		// const total = subtotal - discounts;
		const shippingTaxRates = _filter(rates, { shipping: true });
		// @ts-ignore note: total is a string
		const totalTaxes = calcTaxes(+total, shippingTaxRates);
		const taxes = sumItemizedTaxes(totalTaxes);

		shippingLine.atomicPatch({
			totalTax: String(sumTaxes(totalTaxes)),
			taxes,
		});
	});
}

export const shippingLines = {
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
