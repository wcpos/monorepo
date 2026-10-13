import { useObservable } from 'observable-hooks';
import { map, switchMap } from 'rxjs/operators';

import { queryHandleResults$, useOwnedResource } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { useCollectionQueryHandle } from '../../../query';
import { useDefaultCustomerID } from './use-default-customer-id';
import { useGuestCustomer } from '../hooks/use-guest-customer';

export const useDefaultCustomer = () => {
	const guestCustomer = useGuestCustomer();
	const defaultCustomerID = useDefaultCustomerID();
	const defaultCustomerRemoteId = remoteIdOrNull(defaultCustomerID);
	const handle = useCollectionQueryHandle(
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

	// The guest stands in for an EMPTY answer only: a failed read throws on to the readers'
	// boundary (the POS order, the settings page) rather than hanging them on a fallback.
	const defaultCustomer$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([current, guest]) =>
					queryHandleResults$(current).pipe(
						map((result) => (result.hits.length === 1 ? result.hits[0].record : guest))
					)
				)
			),
		[handle, guestCustomer]
	);

	// The resource the readers suspend on, owned here: its read (a reader of the customers
	// handle) starts when this commits and is destroyed on unmount, Strict Mode replay included.
	const defaultCustomerResource = useOwnedResource(defaultCustomer$);

	return { defaultCustomer$, defaultCustomerResource };
};
