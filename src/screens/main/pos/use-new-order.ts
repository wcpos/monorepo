import * as React from 'react';

import {
	ObservableResource,
	useObservableState,
	useObservableSuspense,
	useSubscription,
	useObservable,
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

const temporaryDB$ = from(createTemporaryDB()).pipe(shareReplay(1));

const emptyOrder$ = temporaryDB$.pipe(
	switchMap(async (db) => {
		let order = await db.orders.findOne().exec();
		if (!order) {
			/**
			 * Need to populate billing and shipping, otherwise billing.country is undefined
			 */
			order = await db.orders.insert({ status: 'pos-open', billing: {}, shipping: {} });
		}
		return order;
	})
	// tap((order) => console.log('emitting new order', order))
);

/**
 *
 */
export const useNewOrder = () => {
	const { store } = useAppState();
	const { defaultCustomer$ } = useDefaultCustomer();

	const newOrder$ = useObservable(
		() =>
			combineLatest([
				emptyOrder$,
				defaultCustomer$.pipe(
					tap((res) => {
						console.log('defaultCustomer$', res);
					})
				),
				store.currency$.pipe(
					tap((res) => {
						console.log('currency$', res);
					})
				),
				store.prices_include_tax$.pipe(
					tap((res) => {
						console.log('prices_include_tax$', res);
					})
				),
				store.tax_based_on$.pipe(
					tap((res) => {
						console.log('tax_based_on$', res);
					})
				),
			]).pipe(
				switchMap(async ([order, customer, currency, prices_include_tax, tax_based_on]) => {
					const customerJSON = isRxDocument(customer) ? customer.toJSON() : customer;
					const newOrder = await order.incrementalPatch({
						// add default customer to order
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

						// add other store settings
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

					return newOrder;
				}),
				tap((order) => console.log('emitting new order', order))
			),
		[]
	);

	return { newOrder$ };
};
