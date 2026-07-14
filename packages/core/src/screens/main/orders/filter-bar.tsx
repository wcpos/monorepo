import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { ObservableResource, useObservable, useObservableEagerState } from 'observable-hooks';
import { map, tap } from 'rxjs/operators';

import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { useQuery, useQueryManager } from '@wcpos/query';

import { forceRefreshFilterCustomer } from './force-refresh-filter-customer';
import { useAppState } from '../../../contexts/app-state';
import { CashierPill } from '../components/order/filter-bar/cashier-pill';
import { CustomerPill } from '../components/order/filter-bar/customer-pill';
import { DateRangePill } from '../components/order/filter-bar/date-range-pill';
import { StatusPill } from '../components/order/filter-bar/status-pill';
import { StorePill } from '../components/order/filter-bar/store-pill';
import { normalizeSelectedCustomerID } from '../components/order/filter-bar/customer-filter-utils';
import { createSelectedEntityFromInputs$ } from '../components/filter-bar/selected-entity';
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
	const customerID = React.useMemo(
		() => normalizeSelectedCustomerID(rawCustomerID as string | number | null | undefined),
		[rawCustomerID]
	);
	const cashierID = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getMetaDataElemMatchValue('_pos_user')))
	);
	const { wpCredentials } = useAppState();
	const manager = useQueryManager();

	/**
	 *
	 */
	const customerQuery = useQuery({
		queryKeys: ['customers', 'orders-customer-filter', customerID ?? 'none'],
		collectionName: 'customers',
		initialParams:
			customerID !== undefined && customerID !== 0
				? {
						selector: { id: customerID },
					}
				: undefined,
	});

	/**
	 *
	 */
	const cashierQuery = useQuery({
		queryKeys: ['customers', 'cashier-filter', cashierID ?? 'none'],
		collectionName: 'customers',
		initialParams:
			cashierID !== undefined && cashierID !== null
				? {
						selector: { id: toNumber(cashierID as string) },
					}
				: undefined,
	});

	/**
	 *
	 */
	const selectedCustomer$ = useObservable(
		(inputs$) =>
			createSelectedEntityFromInputs$(
				inputs$.pipe(
					map(
						([id, result$, selectedGuestCustomer]) =>
							[
								id,
								result$?.pipe(
									tap((result) => {
										if (id && id !== 0 && result.hits.length === 0) {
											void forceRefreshFilterCustomer(manager, toNumber(id), 'customer');
										}
									})
								),
								selectedGuestCustomer,
								false,
							] as const
					)
				)
			),
		[
			customerID as string | number | null | undefined,
			customerQuery?.result$,
			guestCustomer,
			manager,
		]
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
			createSelectedEntityFromInputs$(
				inputs$.pipe(
					map(
						([id, result$]) =>
							[
								id,
								result$?.pipe(
									tap((result) => {
										if (id && result.hits.length === 0) {
											void forceRefreshFilterCustomer(manager, toNumber(id), 'cashier');
										}
									})
								),
								undefined,
								false,
							] as const
					)
				)
			),
		[cashierID as string | number | null | undefined, cashierQuery?.result$, undefined, manager]
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
