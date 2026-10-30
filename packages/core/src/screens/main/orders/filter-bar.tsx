import * as React from 'react';

import isEqual from 'lodash/isEqual';

import { Button, ButtonText } from '@wcpos/components/button';
import { Skeleton } from '@wcpos/components/skeleton';
import { Suspense } from '@wcpos/components/suspense';
import { useQueryRuntime } from '@wcpos/query';
import { isGuestCustomer } from '@wcpos/sync-core';
import { useEngineRecordByWooId } from '@wcpos/query/record-readers';
import { ChipRow } from '@wcpos/components/chip-row';

import { useT } from '../../../contexts/translations';
import { forceRefreshFilterCustomer } from './force-refresh-filter-customer';
import { useStoreSession } from '../../../contexts/app-state';
import { type FiltersOf, useQueryState, useQueryStateActions } from '../../../query';
import { CashierPill } from '../components/order/filter-bar/cashier-pill';
import { RegisterPill } from '../components/order/filter-bar/register-pill';
import { CustomerPill } from '../components/order/filter-bar/customer-pill';
import { DateRangePill } from '../components/order/filter-bar/date-range-pill';
import { PaymentMethodPill } from '../components/order/filter-bar/payment-method-pill';
import { StatusPill } from '../components/order/filter-bar/status-pill';
import { StorePill } from '../components/order/filter-bar/store-pill';
import { useGuestCustomer } from '../hooks/use-guest-customer';
import { storeListResource } from '../hooks/store-list-resource';

export function FilterBar({ initialFilters }: { initialFilters: Partial<FiltersOf<'orders'>> }) {
	const { filters } = useQueryState<'orders'>();
	const actions = useQueryStateActions<'orders'>();
	const t = useT();
	// Clear all counts only what the cashier set: the provider's own cashier and store scope
	// is the resting state, and Clear all returns to it.
	const set = (value: unknown) => (value === undefined || value === '' ? null : value);
	const groups = new Set([...Object.keys(filters), ...Object.keys(initialFilters)]);
	const changed = [...groups].filter(
		(field) =>
			!isEqual(
				set(filters[field as keyof typeof filters]),
				set(initialFilters[field as keyof typeof initialFilters])
			)
	).length;
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
		<ChipRow>
			<StatusPill />
			<PaymentMethodPill />
			{/* A pill that reads a record answers after the row has drawn: it holds a chip's
			    frame meanwhile, so the pills beside it never shift. */}
			<Suspense fallback={<Skeleton shape="chip" />}>
				<CustomerPill
					resource={customerResource}
					guestCustomer={guestCustomer}
					onMissing={refreshCustomer}
				/>
			</Suspense>
			<Suspense fallback={<Skeleton shape="chip" />}>
				<CashierPill resource={cashierResource} onMissing={refreshCashier} />
			</Suspense>
			<Suspense fallback={<Skeleton shape="chip" />}>
				<StorePill resource={storesResource} />
			</Suspense>
			<RegisterPill />
			<DateRangePill />
			{changed >= 2 && (
				<Button
					variant="ghost"
					testID="orders-filter-clear-all"
					onPress={() => actions.resetFilters()}
				>
					<ButtonText>{t('orders.clear_all')}</ButtonText>
				</Button>
			)}
		</ChipRow>
	);
}
