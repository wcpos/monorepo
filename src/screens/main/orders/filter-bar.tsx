import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { useObservableEagerState, ObservableResource, useObservable } from 'observable-hooks';
import { of } from 'rxjs';
import { map, startWith, switchMap, tap } from 'rxjs/operators';

import { HStack } from '@wcpos/components/src/hstack';
import { Suspense } from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { CashierPill } from '../components/order/filter-bar/cashier-pill';
import CustomerPill from '../components/order/filter-bar/customer-pill';
import { DateRangePill } from '../components/order/filter-bar/date-range-pill';
import { StatusPill } from '../components/order/filter-bar/status-pill';
import { StorePill } from '../components/order/filter-bar/store-pill';
import { useGuestCustomer } from '../hooks/use-guest-customer';

/**
 *
 */
const FilterBar = ({ query }) => {
	const guestCustomer = useGuestCustomer();
	const customerID = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('customer_id')))
	);
	const cashierID = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getMetaDataElemMatchValue('_pos_user')))
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
	 * NOTE: customerID can be 0 which is a valid customer ID
	 */
	React.useEffect(() => {
		if (customerID !== null || customerID !== undefined) {
			customerQuery.where('id').equals(customerID).exec();
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
			cashierQuery.where('id').equals(toNumber(cashierID)).exec();
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
		[cashierID]
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
		<HStack className="w-full flex-wrap">
			<StatusPill query={query} />
			<Suspense>
				<CustomerPill resource={customerResource} query={query} customerID={customerID} />
			</Suspense>
			<Suspense>
				<CashierPill resource={cashierResource} query={query} cashierID={cashierID} />
			</Suspense>
			<StorePill resource={storesResource} query={query} />
			<DateRangePill query={query} />
		</HStack>
	);
};

export default FilterBar;
