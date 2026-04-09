import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { ObservableResource, useObservable, useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { useQuery } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { CashierPill } from '../components/order/filter-bar/cashier-pill';
import { CustomerPill } from '../components/order/filter-bar/customer-pill';
import { DateRangePill } from '../components/order/filter-bar/date-range-pill';
import { StatusPill } from '../components/order/filter-bar/status-pill';
import { StorePill } from '../components/order/filter-bar/store-pill';
import { createSelectedEntity$ } from '../components/filter-bar/selected-entity';
import { useGuestCustomer } from '../hooks/use-guest-customer';

/**
 *
 */
export function FilterBar({
	query,
}: {
	query: import('@wcpos/query').Query<import('@wcpos/database').OrderCollection>;
}) {
	const guestCustomer = useGuestCustomer();
	const rawCustomerID = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('customer_id')))
	);
	const customerID = React.useMemo(() => {
		if (rawCustomerID === null || rawCustomerID === undefined || rawCustomerID === '') {
			return undefined;
		}

		return toNumber(rawCustomerID as string | number);
	}, [rawCustomerID]);
	const cashierID = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getMetaDataElemMatchValue('_pos_user')))
	);
	const { wpCredentials } = useAppState();

	/**
	 *
	 */
	const customerQuery = useQuery({
		queryKeys: ['customers', 'orders-customer-filter', customerID ?? 'none'],
		collectionName: 'customers',
		initialParams:
			customerID !== null && customerID !== undefined && customerID !== 0
				? {
						selector: { id: customerID },
					}
				: undefined,
	});

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
			cashierQuery
				?.where('id')
				.equals(toNumber(cashierID as string))
				.exec();
		}
	}, [cashierID, cashierQuery]);

	/**
	 *
	 */
	const selectedCustomer$ = useObservable(
		() =>
			createSelectedEntity$({
				id: customerID as string | number | null | undefined,
				result$: customerQuery?.result$,
				guestCustomer,
			}),
		[customerID, customerQuery, guestCustomer]
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
		() =>
			createSelectedEntity$({
				id: cashierID as string | number | null | undefined,
				result$: cashierQuery?.result$,
			}),
		[cashierID, cashierQuery]
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
				<CashierPill
					resource={cashierResource}
					query={query}
					cashierID={cashierID as number | undefined}
				/>
			</Suspense>
			<StorePill
				resource={
					storesResource as import('observable-hooks').ObservableResource<
						import('@wcpos/database').StoreDocument[]
					>
				}
				query={query}
			/>
			<DateRangePill query={query} />
		</HStack>
	);
}
