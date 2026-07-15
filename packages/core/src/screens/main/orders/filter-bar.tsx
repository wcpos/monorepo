import * as React from 'react';

import { ObservableResource } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { useQueryManager } from '@wcpos/query';

import { forceRefreshFilterCustomer } from './force-refresh-filter-customer';
import { useAppState } from '../../../contexts/app-state';
import { useQueryState } from '../../../query';
import { CashierPill } from '../components/order/filter-bar/cashier-pill';
import { CustomerPill } from '../components/order/filter-bar/customer-pill';
import { DateRangePill } from '../components/order/filter-bar/date-range-pill';
import { StatusPill } from '../components/order/filter-bar/status-pill';
import { StorePill } from '../components/order/filter-bar/store-pill';
import { useEngineDocumentByWooId } from '../hooks/use-engine-document';
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
	const customerResource = useEngineDocumentByWooId<import('@wcpos/database').CustomerDocument>(
		'customers',
		customerID ?? 0
	);
	const cashierResource = useEngineDocumentByWooId<import('@wcpos/database').CustomerDocument>(
		'customers',
		cashierID ?? 0
	);
	const { wpCredentials } = useAppState();
	const manager = useQueryManager();

	const refreshCustomer = React.useCallback(() => {
		if (customerID === undefined || customerID === 0) return;
		void forceRefreshFilterCustomer(manager, customerID, 'customer');
	}, [customerID, manager]);
	const refreshCashier = React.useCallback(() => {
		if (cashierID === undefined || !Number.isFinite(cashierID)) return;
		void forceRefreshFilterCustomer(manager, cashierID, 'cashier');
	}, [cashierID, manager]);

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
					guestCustomer={guestCustomer as unknown as import('@wcpos/database').CustomerDocument}
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
