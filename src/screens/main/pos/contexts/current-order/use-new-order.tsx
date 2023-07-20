import * as React from 'react';

import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import allCurrencies from '../../../../../contexts/currencies/currencies.json';
import useLocalData from '../../../../../contexts/local-data';
import { newOrderResource } from '../../../contexts/orders';
import usePullDocument from '../../../contexts/use-pull-document';
import useCollection from '../../../hooks/use-collection';
import useGuestCustomer from '../../../hooks/use-guest-customer';

/**
 * FIXME: I'm using the direct json from the currencies provider, I need to use a currency provider
 */
const useNewOrder = () => {
	const { store, wpCredentials } = useLocalData();
	const newOrder = useObservableSuspense(newOrderResource);
	const currency = useObservableState(store.currency$, store.currency);
	const prices_include_tax = useObservableState(
		store.prices_include_tax$,
		store.prices_include_tax
	);
	const tax_based_on = useObservableState(store.tax_based_on$, store.tax_based_on);
	const defaultCustomerID = useObservableState(
		combineLatest([store.default_customer$, store.default_customer_is_cashier$]).pipe(
			map(([default_customer, default_customer_is_cashier]) =>
				default_customer_is_cashier ? wpCredentials.id : default_customer
			)
		),
		0
	);
	const { collection: customerCollection } = useCollection('customers');
	const pullDocument = usePullDocument();
	const guestCustomer = useGuestCustomer();

	/**
	 * Update new order with tax settings, currenct
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
	}, [currency, prices_include_tax, newOrder, tax_based_on]);

	/**
	 * HACK: Update new order with default customer
	 */
	React.useEffect(() => {
		async function getCustomer() {
			try {
				let defaultCustomer = await customerCollection
					.findOneFix({ selector: { id: defaultCustomerID } })
					.exec();
				if (!defaultCustomer) {
					defaultCustomer = await pullDocument(defaultCustomerID, customerCollection);
				}
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
			} catch (error) {
				log.error(error);
			}
		}

		if (defaultCustomerID) {
			getCustomer();
		} else {
			newOrder.incrementalPatch(guestCustomer);
		}
	}, [customerCollection, defaultCustomerID, guestCustomer, newOrder, pullDocument]);

	return newOrder;
};

export default useNewOrder;
