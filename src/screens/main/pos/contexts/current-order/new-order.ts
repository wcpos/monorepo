// import * as React from 'react';
import { BehaviorSubject, of } from 'rxjs';

import log from '@wcpos/utils/src/logger';

// type CustomerDocument = import('@wcpos/database').CustomerDocument;
type OrderDocument = import('@wcpos/database').OrderDocument;
type OrderCollection = import('@wcpos/database').OrderCollection;

interface Props {
	collection: OrderCollection;
	currency_symbol: string;
	currency: string;
}

/**
 * RxDB removed Temporary Documents in v13
 * see: https://github.com/pubkey/rxdb/pull/3777#issuecomment-1120669088
 *
 * The suggestion is to use an empty JSON and update the data there
 * but I need some extra functionality so I'm using a custom class
 */
export default class NewOrder {
	public collection;
	public customer_id: number;
	public customer_id$: BehaviorSubject<number>;
	public billing: any;
	public billing$: BehaviorSubject<any>;
	public shipping: any;
	public shipping$: BehaviorSubject<any>;
	public line_items = [];
	public fee_lines = [];
	public shipping_lines = [];
	public currency_symbol: string;
	public currency: string;

	constructor({ collection, currency_symbol, currency }: Props) {
		this.collection = collection;

		this.customer_id = 0;
		this.customer_id$ = new BehaviorSubject(0);
		this.billing = {};
		this.billing$ = new BehaviorSubject({});
		this.shipping = {};
		this.shipping$ = new BehaviorSubject({});
		this.line_items$ = of([]);
		this.fee_lines$ = of([]);
		this.shipping_lines$ = of([]);
		this.currency_symbol = currency_symbol;
		this.currency = currency;
	}

	toJSON() {
		const {
			customer_id,
			billing,
			shipping,
			line_items,
			fee_lines,
			shipping_lines,
			currency_symbol,
			currency,
		} = this;

		return {
			status: 'pos-open',
			date_created_gmt: new Date(Date.now()).toISOString().split('.')[0],
			customer_id,
			billing,
			shipping,
			line_items,
			fee_lines,
			shipping_lines,
			currency_symbol,
			currency,
		};
	}

	toMutableJSON() {
		return this.toJSON();
	}
}
