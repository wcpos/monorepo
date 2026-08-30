import { useObservable } from 'observable-hooks';
import { map, switchMap } from 'rxjs/operators';

import { useQueryRuntime, useSuspenseResource } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { useCollectionBinding } from '../../../query';
import { useDefaultCustomerID } from './use-default-customer-id';
import { useGuestCustomer } from '../hooks/use-guest-customer';

export const useDefaultCustomer = () => {
	const runtime = useQueryRuntime();
	const guestCustomer = useGuestCustomer();
	const defaultCustomerID = useDefaultCustomerID();
	const defaultCustomerRemoteId = remoteIdOrNull(defaultCustomerID);
	const binding = useCollectionBinding(
		'customers',
		{
			search: '',
			filters: {},
			sort: { field: 'id', direction: 'asc' },
			limit: 1,
		},
		// 0 = guest: purely local, never a server record. Passing remote id 0
		// created a targeted include=0 pull that returned 0/1 records and
		// failed its apply tick on every boot, jamming the customers cursor
		// (monorepo#850). An empty id set matches nothing locally, so the
		// guest fallback below serves, and no fetch is ever declared.
		{ remoteIds: defaultCustomerID > 0 && defaultCustomerRemoteId ? [defaultCustomerRemoteId] : [] }
	);

	const defaultCustomer$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([result$, guest]) =>
					result$.pipe(map((result) => (result.hits.length === 1 ? result.hits[0].record : guest)))
				)
			),
		[binding.result$, guestCustomer]
	);

	// Bridged across Suspense retries (see `useSuspenseResource`). Both callers — the general
	// settings form and `useNewOrder` — read this resource with `useObservableSuspense` in the
	// SAME component that builds it, with no boundary in between, which is the exact shape of
	// the Orders blank body (#1707): a `useMemo` resource is thrown away with the uncommitted
	// fiber, the retry builds another, and a customers query's first emission is always async,
	// so the wait never ends. The default id and complete guest fallback are the input identity,
	// so a changed default or store-derived fallback reloads in place instead of being reused.
	const defaultCustomerResource = useSuspenseResource(
		runtime.engine,
		JSON.stringify([defaultCustomerID, guestCustomer]),
		defaultCustomer$
	);

	return { defaultCustomer$, defaultCustomerResource };
};
