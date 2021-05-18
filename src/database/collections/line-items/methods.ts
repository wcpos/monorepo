import { from, combineLatest, Observable } from 'rxjs';
import { switchMap, map, tap } from 'rxjs/operators';
import isFinite from 'lodash/isFinite';
import { calcTaxes, sumTaxes } from '../utils';

type LineItemDocument = import('../../').LineItemDocument;

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

/**
 * WooCommerce Order Line Item methods
 */
export default {
	/**
	 * After discounts
	 */
	computedTotal$(this: LineItemDocument) {
		return combineLatest([this.quantity$, this.price$]).pipe(
			map(([quantity = 0, price = 0]) => String(quantity * price)),
			tap((total: string) => {
				if (total !== this.total) this.atomicPatch({ total });
			})
		);
	},

	/**
	 * Before discounts
	 */
	computedSubtotal$(this: LineItemDocument) {
		return combineLatest([this.quantity$, this.price$]).pipe(
			map(([quantity = 0, price = 0]) => String(quantity * price)),
			tap((subtotal: string) => {
				if (subtotal !== this.subtotal) this.atomicPatch({ subtotal });
			})
		);
	},

	/**
	 *
	 */
	computedTaxes$(this: LineItemDocument) {
		// @ts-ignore
		return this.price$.pipe(map((price) => calcTaxes(price, taxRates)));
	},

	/**
	 *
	 */
	computedTotalTax$(this: LineItemDocument) {
		// @ts-ignore
		return this.computedTaxes$().pipe(map((taxes) => sumTaxes(taxes)));
	},
};
