import * as React from 'react';
import { View } from 'react-native';

import { endOfDay, startOfDay } from 'date-fns';
import toNumber from 'lodash/toNumber';
import { useObservableEagerState, ObservableResource, useObservable } from 'observable-hooks';
import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { Card } from '@wcpos/components/src/card';
import { HStack } from '@wcpos/components/src/hstack';
import { Suspense } from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import { useReports } from './context';
import { useAppState } from '../../../contexts/app-state';
import { convertLocalDateToUTCString } from '../../../hooks/use-local-date';
import { CashierPill } from '../components/order/filter-bar/cashier-pill';
import CustomerPill from '../components/order/filter-bar/customer-pill';
import { DateRangePill } from '../components/order/filter-bar/date-range-pill';
import { StatusPill } from '../components/order/filter-bar/status-pill';
import { StorePill } from '../components/order/filter-bar/store-pill';
import { useGuestCustomer } from '../hooks/use-guest-customer';

/**
 *
 */
export const FilterBar = () => {
	const { query } = useReports();
	const guestCustomer = useGuestCustomer();
	const customerID = useObservableEagerState(
		query.params$.pipe(map(() => query.getSelector('customer_id')))
	);
	const cashierID = useObservableEagerState(
		query.params$.pipe(map(() => query.getMetaDataElemMatchValue('_pos_user')))
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
			customerQuery.where('id').equals(toNumber(customerID)).exec();
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
	 * Remove the date range filter
	 * For reports we do want to show all orders, the calculations would grind the POS to a halt
	 * Default to today
	 */
	const today = React.useMemo(() => new Date(), []);
	const removeDateRangeFilter = React.useCallback(() => {
		query
			.where('date_created_gmt')
			.gte(convertLocalDateToUTCString(startOfDay(today)))
			.lte(convertLocalDateToUTCString(endOfDay(today)))
			.exec();
	}, [query, today]);

	/**
	 *
	 */
	return (
		<View className="p-2 pb-0">
			<Card className="p-2 w-full bg-input">
				<HStack className="w-full flex-wrap">
					<StatusPill query={query} />
					<Suspense>
						<CustomerPill resource={customerResource} query={query} />
					</Suspense>
					<Suspense>
						<CashierPill resource={cashierResource} query={query} />
					</Suspense>
					<StorePill resource={storesResource} query={query} />
					<DateRangePill query={query} onRemove={removeDateRangeFilter} />
				</HStack>
			</Card>
		</View>
	);
};
