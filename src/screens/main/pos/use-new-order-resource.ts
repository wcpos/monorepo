import * as React from 'react';

import { ObservableResource, useObservableState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { from, throwError, combineLatest, of } from 'rxjs';
import { switchMap, filter, first, expand, catchError, map, tap } from 'rxjs/operators';

import { createTemporaryDB } from '@wcpos/database';

import allCurrencies from '../../../contexts/currencies/currencies.json';
import useLocalData from '../../../contexts/local-data';
import usePullDocument from '../contexts/use-pull-document';
import useCollection from '../hooks/use-collection';
import useGuestCustomer from '../hooks/use-guest-customer';

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
	expand((order) =>
		order.deleted$.pipe(
			filter((deleted) => deleted),
			switchMap(() => from(getOrCreateNewOrder())),
			first()
		)
	),
	catchError((err) => throwError(err)) // propagate the error in RxJS pipeline
);

/**
 *
 */
const useNewOrderResource = () => {
	const { store, wpCredentials } = useLocalData();
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
		store.default_customer_is_cashier ? wpCredentials.id : store.default_customer
	);
	const { collection: customerCollection } = useCollection('customers');
	const pullDocument = usePullDocument();
	const guestCustomer = useGuestCustomer();

	/**
	 *
	 */
	const resource = React.useMemo(() => {
		const customer$ = defaultCustomerID
			? customerCollection.findOne({ selector: { id: defaultCustomerID } }).$.pipe(
					tap((doc) => {
						if (!isRxDocument(doc)) {
							pullDocument(defaultCustomerID, customerCollection);
						}
					})
			  )
			: of(guestCustomer);

		const resource$ = combineLatest([docResource$, customer$]).pipe(
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
	}, [
		currency,
		customerCollection,
		defaultCustomerID,
		guestCustomer,
		prices_include_tax,
		pullDocument,
		tax_based_on,
	]);

	return resource;
};

export default useNewOrderResource;
