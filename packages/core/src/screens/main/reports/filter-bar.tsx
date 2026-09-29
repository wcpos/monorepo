import * as React from 'react';
import { View } from 'react-native';

import { Card } from '@wcpos/components/card';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { useQueryRuntime } from '@wcpos/query';
import { isGuestCustomer } from '@wcpos/sync-core';

import { forceRefreshFilterCustomer } from '../orders/force-refresh-filter-customer';
import { useQueryState } from '../../../query';
import { CashierPill } from '../components/order/filter-bar/cashier-pill';
import { CustomerPill } from '../components/order/filter-bar/customer-pill';
import { StatusPill } from '../components/order/filter-bar/status-pill';
import { useEngineRecordByWooId } from '../hooks/use-engine-document';
import { useGuestCustomer } from '../hooks/use-guest-customer';

/**
 * The 1.10 pills that survive until the hero chips replace them. The register, store and
 * date pills are gone: the bar's register/store menu and the date button own that scope,
 * and on Free those controls carry the lock, which a pill underneath would have bypassed.
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
	const runtime = useQueryRuntime();

	const refreshCustomer = React.useCallback(() => {
		if (customerID === undefined || isGuestCustomer(customerID)) return;
		void forceRefreshFilterCustomer(runtime, customerID, 'customer');
	}, [customerID, runtime]);
	const refreshCashier = React.useCallback(() => {
		if (cashierID === undefined || !Number.isFinite(cashierID)) return;
		void forceRefreshFilterCustomer(runtime, cashierID, 'cashier');
	}, [cashierID, runtime]);

	return (
		<View className="p-2 pb-0">
			<Card className="bg-card-header w-full p-2">
				<HStack className="w-full flex-wrap">
					<StatusPill />
					{/* Each pill keeps its own boundary: a pill still waiting for its records must
					    never blank the screen around it (#1707). */}
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
				</HStack>
			</Card>
		</View>
	);
}
