import * as React from 'react';

import {
	ObservableResource,
	useObservableState,
	useObservableSuspense,
	useSubscription,
} from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { from, throwError, combineLatest, of } from 'rxjs';
import {
	switchMap,
	filter,
	first,
	expand,
	catchError,
	tap,
	distinctUntilChanged,
	shareReplay,
	withLatestFrom,
} from 'rxjs/operators';

import { createTemporaryDB } from '@wcpos/database';

import { useDefaultCustomer } from './use-default-customer';
import { useAppState } from '../../../contexts/app-state';
import allCurrencies from '../../../contexts/currencies/currencies.json';

/**
 *
 */
async function getOrCreateNewOrder() {
	try {
		const db = await createTemporaryDB();
		let order = await db.orders.findOne().exec();
		if (!order) {
			/**
			 * Need to populate billing and shipping, otherwise billing.country is undefined
			 */
			order = await db.orders.insert({ status: 'pos-open', billing: {}, shipping: {} });
		}
		return order;
	} catch (err) {
		return Promise.reject(err); // propagate the error
	}
}

/**
 *
 */
const docResource$ = from(getOrCreateNewOrder()).pipe(
	expand((order) =>
		order.deleted$.pipe(
			filter((deleted) => deleted === true),
			switchMap(() => from(getOrCreateNewOrder())),
			first()
		)
	),
	distinctUntilChanged((prev, curr) => prev.uuid === curr.uuid),
	tap(() => console.log('emitting new order'))
);

const resource = new ObservableResource(docResource$);

/**
 *
 */
export const useNewOrder = () => {
	const { store } = useAppState();
	const newOrder = useObservableSuspense(resource);
	const currency = useObservableState(store.currency$, store.currency);
	const prices_include_tax = useObservableState(
		store.prices_include_tax$,
		store.prices_include_tax
	);
	const tax_based_on = useObservableState(store.tax_based_on$, store.tax_based_on);
	const customer$ = useDefaultCustomer();

	/**
	 *
	 */
	React.useEffect(() => {
		newOrder.incrementalPatch({
			currency,
			currency_symbol: allCurrencies.find((c) => c.code === currency).symbol || '',
			prices_include_tax: prices_include_tax === 'yes',
			meta_data: [
				{
					key: '_woocommerce_pos_tax_based_on',
					value: tax_based_on,
				},
			],
		});
	}, [currency, newOrder, prices_include_tax, tax_based_on]);

	/**
	 *
	 */
	useSubscription(customer$, (customer) => {
		const customerJSON = isRxDocument(customer) ? customer.toJSON() : customer;
		newOrder.incrementalPatch({
			customer_id: customerJSON?.id,
			billing: {
				...(customerJSON?.billing || {}),
				email: customerJSON?.billing?.email || customerJSON?.email,
				first_name:
					customerJSON?.billing?.first_name || customerJSON?.first_name || customerJSON?.username,
				last_name: customerJSON?.billing?.last_name || customerJSON?.last_name,
			},
			shipping: customerJSON?.shipping,
		});
	});

	return newOrder;
};
