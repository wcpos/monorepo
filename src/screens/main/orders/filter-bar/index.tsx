import * as React from 'react';

import { useFocusEffect } from '@react-navigation/native';
import get from 'lodash/get';
import { useObservableState, ObservableResource, useObservable } from 'observable-hooks';
import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import Suspense from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import { CashierPill } from './cashier-pill';
import CustomerPill from './customer-pill';
import StatusPill from './status-pill';
import { StorePill } from './store-pill';
import { findMetaDataSelector } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useGuestCustomer } from '../../hooks/use-guest-customer';

/**
 *
 */
const FilterBar = ({ query }) => {
	const guestCustomer = useGuestCustomer();
	const customerID = useObservableState(
		query.params$.pipe(map((params) => get(params, ['selector', 'customer_id']))),
		get(query.getParams(), ['selector', 'customer_id'])
	);
	const cashierID = useObservableState(
		query.params$.pipe(map((params) => findMetaDataSelector(params, '_pos_user'))),
		findMetaDataSelector(query.getParams(), '_pos_user')
	);
	const { wpCredentials } = useAppState();

	/**
	 *
	 */
	const customerQuery = useQuery({
		queryKeys: ['customers', 'customer-filter'],
		collectionName: 'customers',
	});

	/**
	 *
	 */
	React.useEffect(() => {
		if (customerID) {
			customerQuery.where('id', customerID);
		}
	}, [customerID, customerQuery]);

	/**
	 *
	 */
	const cashierQuery = useQuery({
		queryKeys: ['customers', 'cashier-filter'],
		collectionName: 'customers',
	});

	/**
	 *
	 */
	React.useEffect(() => {
		if (cashierID) {
			cashierQuery.where('id', parseInt(cashierID, 10));
		}
	}, [cashierID, cashierQuery]);

	/**
	 *
	 */
	const selectedCustomer$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([id]) => {
					if (id === 0) {
						return of(guestCustomer);
					}
					if (!id) {
						return of(null);
					}
					return customerQuery.result$.pipe(
						map((result) => {
							if (result.count === 1) return result.hits[0].document;
						})
					);
				})
			),
		[customerID]
	);

	/**
	 *
	 */
	const customerResource = React.useMemo(
		() => new ObservableResource(selectedCustomer$),
		[selectedCustomer$]
	);

	/**
	 *
	 */
	const selectedCashier$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([id]) => {
					if (id === 0) {
						return of(guestCustomer);
					}
					if (!id) {
						return of(null);
					}
					return cashierQuery.result$.pipe(
						map((result) => {
							if (result.count === 1) return result.hits[0].document;
						})
					);
				})
			),
		[parseInt(cashierID, 10)]
	);

	/**
	 *
	 */
	const cashierResource = React.useMemo(
		() => new ObservableResource(selectedCashier$),
		[selectedCashier$]
	);

	/**
	 *
	 */
	const storesResource = React.useMemo(
		() => new ObservableResource(wpCredentials.populate$('stores'), (val) => !!val),
		[wpCredentials]
	);

	/**
	 *
	 */
	return (
		<Box space="small" horizontal>
			<StatusPill query={query} />
			<Suspense>
				<CustomerPill resource={customerResource} query={query} />
			</Suspense>
			<Suspense>
				<CashierPill resource={cashierResource} query={query} />
			</Suspense>
			<StorePill resource={storesResource} query={query} />
		</Box>
	);
};

export default FilterBar;
