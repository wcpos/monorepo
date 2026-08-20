import * as React from 'react';

import { ObservableResource } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { useQueryRuntime } from '@wcpos/query';
import { isGuestCustomer } from '@wcpos/sync-core';

import { forceRefreshFilterCustomer } from './force-refresh-filter-customer';
import { useAppState } from '../../../contexts/app-state';
import { useQueryState } from '../../../query';
import { CashierPill } from '../components/order/filter-bar/cashier-pill';
import { CustomerPill } from '../components/order/filter-bar/customer-pill';
import { DateRangePill } from '../components/order/filter-bar/date-range-pill';
import { StatusPill } from '../components/order/filter-bar/status-pill';
import { StorePill } from '../components/order/filter-bar/store-pill';
import { useEngineRecordByWooId } from '../hooks/use-engine-document';
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
	const guestCustomer = useGuestCustomer();
	const customerResource = useEngineRecordByWooId('customers', customerID ?? 0);
	const cashierResource = useEngineRecordByWooId('customers', cashierID ?? 0);
	const { wpCredentials } = useAppState();
	const runtime = useQueryRuntime();

	const refreshCustomer = React.useCallback(() => {
		if (customerID === undefined || isGuestCustomer(customerID)) return;
		void forceRefreshFilterCustomer(runtime, customerID, 'customer');
	}, [customerID, runtime]);
	const refreshCashier = React.useCallback(() => {
		if (cashierID === undefined || !Number.isFinite(cashierID)) return;
		void forceRefreshFilterCustomer(runtime, cashierID, 'cashier');
	}, [cashierID, runtime]);

	const storesResource = React.useMemo(
		() => new ObservableResource(wpCredentials.populate$('stores'), (val) => !!val),
		[wpCredentials]
	);

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
			<StorePill
				resource={
					storesResource as import('observable-hooks').ObservableResource<
						import('@wcpos/database').StoreDocument[]
					>
				}
			/>
			<DateRangePill />
		</HStack>
	);
}
