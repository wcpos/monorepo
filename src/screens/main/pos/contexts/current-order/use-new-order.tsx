import * as React from 'react';

import { useObservableState, useObservableSuspense, useSubscription } from 'observable-hooks';
import { combineLatest } from 'rxjs';

import allCurrencies from '../../../../../contexts/currencies/currencies.json';
import useLocalData from '../../../../../contexts/local-data';
import useCustomers from '../../../contexts/customers';
import useOrders from '../../../contexts/orders';

/**
 * FIXME: I'm using the direct json from the currencies provider, I need to use a currency provider
 */
const useNewOrder = () => {
	const { store, wpCredentials } = useLocalData();
	const { newOrderResource } = useOrders();
	const newOrder = useObservableSuspense(newOrderResource);
	const { data: customers, query$, setQuery } = useCustomers();
	const defaultCustomer = customers.length ? customers[0] : null;
	const currency = useObservableState(store.currency$, store.currency);
	const prices_include_tax = useObservableState(
		store.prices_include_tax$,
		store.prices_include_tax
	);

	/**
	 *
	 */
	useSubscription(
		combineLatest([store.default_customer$, store.default_customer_is_cashier$]),
		([default_customer, default_customer_is_cashier]) => {
			const defaultCustomerID = default_customer_is_cashier ? wpCredentials.id : default_customer;
			const query = query$.getValue();
			if (query.selector.id !== defaultCustomerID) {
				setQuery('selector', { id: defaultCustomerID });
			}
		}
	);

	/**
	 * Update new order with tax settings, currenct
	 */
	React.useEffect(() => {
		newOrder.incrementalPatch({
			currency,
			currency_symbol: allCurrencies.find((c) => c.code === currency).symbol || '',
			prices_include_tax: prices_include_tax === 'yes',
		});
	}, [currency, prices_include_tax, newOrder]);

	/**
	 * Update new order with default customer
	 */
	React.useEffect(() => {
		if (defaultCustomer) {
			const data = defaultCustomer.toJSON();
			newOrder.incrementalPatch({
				customer_id: data.id,
				billing: {
					...(data.billing || {}),
					email: data?.billing?.email || data?.email,
					first_name: data?.billing?.first_name || data.first_name || data?.username,
					last_name: data?.billing?.last_name || data.last_name,
				},
				shipping: data.shipping,
			});
		} else {
			newOrder.incrementalPatch({
				customer_id: 0,
				billing: {},
				shipping: {},
			});
		}
	}, [defaultCustomer, newOrder]);

	return newOrder;
};

export default useNewOrder;
