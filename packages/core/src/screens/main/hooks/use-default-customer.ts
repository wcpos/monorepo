import * as React from 'react';

import { ObservableResource, useObservable } from 'observable-hooks';
import { map, switchMap } from 'rxjs/operators';

import { queryHandleResults$ } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { useCollectionQueryHandle } from '../../../query';
import { useDefaultCustomerID } from './use-default-customer-id';
import { useGuestCustomer } from '../hooks/use-guest-customer';

import type { ObservedValueOf } from 'rxjs';

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

	// One resource over the hook's one stream (`useObservable` hands back the same observable for
	// the hook's life), destroyed on unmount: it subscribes on construction, and its subscription
	// is a reader of the customers handle that would otherwise outlive the caller. `renew` swaps
	// in a live one only when the held one is destroyed; the ref is what the mount-only cleanup
	// destroys.
	const [defaultCustomerResource, renew] = React.useReducer(
		(current: ObservableResource<ObservedValueOf<typeof defaultCustomer$>>) =>
			current.isDestroyed ? new ObservableResource(defaultCustomer$) : current,
		defaultCustomer$,
		(customer$) => new ObservableResource(customer$)
	);
	const resourceRef = React.useRef(defaultCustomerResource);
	React.useEffect(() => {
		resourceRef.current = defaultCustomerResource;
	});
	React.useEffect(() => {
		// Strict Mode replays this effect with the same refs: the replayed cleanup destroyed the
		// resource, so the setup re-renders the readers onto a live one.
		if (resourceRef.current.isDestroyed) renew();
		return () => resourceRef.current.destroy();
	}, []);

	return { defaultCustomer$, defaultCustomerResource };
};
