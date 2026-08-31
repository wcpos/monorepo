import * as React from 'react';
import { View } from 'react-native';

import { endOfDay, startOfDay } from 'date-fns';

import { Card } from '@wcpos/components/card';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { useQueryRuntime } from '@wcpos/query';
import { isGuestCustomer } from '@wcpos/sync-core';

import { forceRefreshFilterCustomer } from '../orders/force-refresh-filter-customer';
import { useStoreSession } from '../../../contexts/app-state';
import { convertLocalDateToUTCString } from '../../../hooks/use-local-date';
import { useQueryState, useQueryStateActions } from '../../../query';
import { CashierPill } from '../components/order/filter-bar/cashier-pill';
import { CustomerPill } from '../components/order/filter-bar/customer-pill';
import { DateRangePill } from '../components/order/filter-bar/date-range-pill';
import { StatusPill } from '../components/order/filter-bar/status-pill';
import { StorePill } from '../components/order/filter-bar/store-pill';
import { useEngineRecordByWooId } from '../hooks/use-engine-document';
import { storeListResource } from '../hooks/store-list-resource';
import { useGuestCustomer } from '../hooks/use-guest-customer';

/**
 *
 */
export function FilterBar() {
	const customerID = useQueryState<'orders', number | undefined>(
		(state) => state.filters.customer_id
	);
	const cashierFilter = useQueryState<'orders', string | number | undefined>(
		(state) => state.filters.cashier
	);
	const cashierID = cashierFilter === undefined ? undefined : Number(cashierFilter);
	const actions = useQueryStateActions<'orders'>();
	const guestCustomer = useGuestCustomer();
	const customerResource = useEngineRecordByWooId('customers', customerID ?? 0);
	const cashierResource = useEngineRecordByWooId('customers', cashierID ?? 0);
	const { wpCredentials } = useStoreSession();
	const runtime = useQueryRuntime();

	const refreshCustomer = React.useCallback(() => {
		if (customerID === undefined || isGuestCustomer(customerID)) return;
		void forceRefreshFilterCustomer(runtime, customerID, 'customer');
	}, [customerID, runtime]);
	const refreshCashier = React.useCallback(() => {
		if (cashierID === undefined || !Number.isFinite(cashierID)) return;
		void forceRefreshFilterCustomer(runtime, cashierID, 'cashier');
	}, [cashierID, runtime]);

	// Held outside React on purpose — a resource rebuilt on each Suspense retry re-suspends
	// forever. See `store-list-resource.ts`.
	const storesResource = storeListResource(wpCredentials);

	/**
	 * Reports must stay bounded to a date window; clearing restores today's window.
	 */
	const today = React.useMemo(() => new Date(), []);
	const removeDateRangeFilter = React.useCallback(() => {
		actions.setFilter('dateRange', {
			from: convertLocalDateToUTCString(startOfDay(today)),
			to: convertLocalDateToUTCString(endOfDay(today)),
		});
	}, [actions, today]);

	return (
		<View className="p-2 pb-0">
			<Card className="bg-card-header w-full p-2">
				<HStack className="w-full flex-wrap">
					<StatusPill />
					<Suspense>
						<CustomerPill
							resource={customerResource}
							guestCustomer={guestCustomer}
							onMissing={refreshCustomer}
						/>
					</Suspense>
					<Suspense>
						<CashierPill resource={cashierResource} onMissing={refreshCashier} />
					</Suspense>
					{/* Its own boundary, like the two pills above: a pill still waiting for its
					    records must never blank the screen around it. Without this the
					    suspension escaped to expo-router's per-route boundary, whose production
					    fallback is `null`, which is how the Orders body came to render empty
					    under a painted header (#1707, CI run 33295532237). */}
					<Suspense>
						<StorePill resource={storesResource} />
					</Suspense>
					<DateRangePill onRemove={removeDateRangeFilter} />
				</HStack>
			</Card>
		</View>
	);
}
