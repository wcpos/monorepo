import * as React from 'react';

import { useObservableSuspense, useSubscription } from 'observable-hooks';
import { combineLatest } from 'rxjs';

import useLocalData from '../../../../../contexts/local-data';
import useCustomers from '../../../contexts/customers';
import useOrders from '../../../contexts/orders';

const useNewOrder = () => {
	const { store, wpCredentials } = useLocalData();
	const { newOrderResource } = useOrders();
	const newOrder = useObservableSuspense(newOrderResource);
	const { data: customers, query$, setQuery } = useCustomers();
	const defaultCustomer = customers.length ? customers[0] : null;

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
	// update new order with default info
	// currency,
	// 		prices_include_tax: prices_include_tax === 'yes',
	 */
	React.useEffect(() => {
		if (defaultCustomer) {
			const data = defaultCustomer.toJSON();
			newOrder.incrementalPatch({
				customer_id: data.id,
				billing: data.billing,
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
