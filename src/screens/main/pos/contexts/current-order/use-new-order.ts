import * as React from 'react';

import {
	useObservableSuspense,
	useObservableEagerState,
	ObservableResource,
} from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { from } from 'rxjs';
import { switchMap, shareReplay, tap, distinctUntilChanged, filter } from 'rxjs/operators';
import useDeepCompareEffect from 'use-deep-compare-effect';

import { createTemporaryDB } from '@wcpos/database';

import { useAppState } from '../../../../../contexts/app-state';
import allCurrencies from '../../../../../contexts/currencies/currencies.json';
import { useDefaultCustomer } from '../../../hooks/use-default-customer';
import { transformCustomerJSONToOrderJSON } from '../../hooks/utils';

const temporaryDB$ = from(createTemporaryDB()).pipe(shareReplay(1));

const newOrder$ = temporaryDB$.pipe(
	switchMap((db) =>
		db.orders.findOne().$.pipe(
			filter((order) => {
				if (!isRxDocument(order)) {
					db.orders.insert({ status: 'pos-open', billing: {}, shipping: {} });
					return false;
				}
				return true;
			})
		)
	),
	distinctUntilChanged((prev, next) => prev?.uuid === next?.uuid)
	// tap((order) => console.log('emitting new order', order))
);

const newOrderResource = new ObservableResource(newOrder$);

/**
 *
 */
export const useNewOrder = () => {
	const { store } = useAppState();
	const { defaultCustomerResource } = useDefaultCustomer();
	const defaultCustomer = useObservableSuspense(defaultCustomerResource);
	const currency = useObservableEagerState(store.currency$);
	const prices_include_tax = useObservableEagerState(store.prices_include_tax$);
	const tax_based_on = useObservableEagerState(store.tax_based_on$);
	const defaultCountry = useObservableEagerState(store.default_country$);
	const [country, state] = defaultCountry.split(':');
	const newOrder = useObservableSuspense(newOrderResource);

	/**
	 * @TODO - change to .modify()
	 */
	useDeepCompareEffect(() => {
		const customer = isRxDocument(defaultCustomer)
			? defaultCustomer.toMutableJSON()
			: defaultCustomer;
		const data = transformCustomerJSONToOrderJSON(customer, country);
		data.currency = currency;
		data.currency_symbol = allCurrencies.find((c) => c.code === currency).symbol || '';
		data.prices_include_tax = prices_include_tax === 'yes';
		data.meta_data = [
			{
				key: '_woocommerce_pos_tax_based_on',
				value: tax_based_on,
			},
		];

		newOrder.incrementalPatch(data);
	}, [defaultCustomer, currency, prices_include_tax, tax_based_on, country]);

	return { newOrder };
};
