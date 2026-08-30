import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { useQueryRuntime } from '@wcpos/query';
import { isGuestCustomer } from '@wcpos/sync-core';

import { forceRefreshFilterCustomer } from './force-refresh-filter-customer';
import { useStoreSession } from '../../../contexts/app-state';
import { useQueryState } from '../../../query';
import { CashierPill } from '../components/order/filter-bar/cashier-pill';
import { CustomerPill } from '../components/order/filter-bar/customer-pill';
import { DateRangePill } from '../components/order/filter-bar/date-range-pill';
import { StatusPill } from '../components/order/filter-bar/status-pill';
import { StorePill } from '../components/order/filter-bar/store-pill';
import { useEngineRecordByWooId } from '../hooks/use-engine-document';
import { useGuestCustomer } from '../hooks/use-guest-customer';
import { storeListResource } from '../hooks/store-list-resource';

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

	return (
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
			{/* Its own boundary, like the two pills above: a pill still waiting for its records
			    must never blank the screen around it. Without this the suspension escaped to
			    expo-router's per-route boundary, whose production fallback is `null`, and the
			    Orders body rendered empty under a painted header (CI run 33295532237). */}
			<Suspense>
				<StorePill resource={storesResource} />
			</Suspense>
			<DateRangePill />
		</HStack>
	);
}
