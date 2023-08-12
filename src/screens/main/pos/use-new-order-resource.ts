import * as React from 'react';

import { ObservableResource, useObservableState, useSubscription } from 'observable-hooks';
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
import { useAppStateManager } from '../../../contexts/app-state-manager';
import allCurrencies from '../../../contexts/currencies/currencies.json';

/**
 *
 */
async function getOrCreateNewOrder() {
	try {
		const db = await createTemporaryDB();
		let order = await db.orders.findOne().exec();
		if (!order) {
			order = await db.orders.insert({ status: 'pos-open' });
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
	tap(() => console.log('hi')),
	expand((order) =>
		order.deleted$.pipe(
			filter((deleted) => deleted === true),
			switchMap(() => from(getOrCreateNewOrder())),
			first()
		)
	),
	distinctUntilChanged((prev, curr) => prev.uuid === curr.uuid),
	tap(() => console.log('emitting new order')),
	catchError((err) => throwError(err)), // propagate the error in RxJS pipeline
	shareReplay(1)
);

/**
 *
 */
const useNewOrderResource = () => {
	const appStateManager = useAppStateManager();
	const store = useObservableState(appStateManager.store$, appStateManager.store);
	const currency = useObservableState(store.currency$, store.currency);
	const prices_include_tax = useObservableState(
		store.prices_include_tax$,
		store.prices_include_tax
	);
	const tax_based_on = useObservableState(store.tax_based_on$, store.tax_based_on);
	const customer$ = useDefaultCustomer();

	React.useEffect(() => {
		console.log('store', store);
	}, [store]);

	React.useEffect(() => {
		console.log('currency', currency);
	}, [currency]);

	React.useEffect(() => {
		console.log('prices_include_tax', prices_include_tax);
	}, [prices_include_tax]);

	React.useEffect(() => {
		console.log('tax_based_on', tax_based_on);
	}, [tax_based_on]);

	React.useEffect(() => {
		console.log('customer$', customer$);
	}, [customer$]);

	/**
	 *
	 */
	const resource = React.useMemo(() => {
		console.log('hi');
		const resource$ = docResource$.pipe(
			tap((res) => {
				console.log('res1', res);
			}),
			withLatestFrom(customer$),
			tap((res) => {
				console.log('res2', res);
			}),
			switchMap(([order, customer]) => {
				const customerJSON = isRxDocument(customer) ? customer.toJSON() : customer;
				return order.incrementalPatch({
					customer_id: customerJSON?.id,
					billing: {
						...(customerJSON?.billing || {}),
						email: customerJSON?.billing?.email || customerJSON?.email,
						first_name:
							customerJSON?.billing?.first_name ||
							customerJSON?.first_name ||
							customerJSON?.username,
						last_name: customerJSON?.billing?.last_name || customerJSON?.last_name,
					},
					shipping: customerJSON?.shipping,
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
			})
		);

		return new ObservableResource(resource$);
	}, [currency, customer$, prices_include_tax, tax_based_on]);

	return resource;
};

export default useNewOrderResource;
