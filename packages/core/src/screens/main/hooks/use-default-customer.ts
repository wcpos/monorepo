import * as React from 'react';

import { ObservableResource, useObservable } from 'observable-hooks';
import { map, switchMap } from 'rxjs/operators';

import { remoteIdOrNull } from '@wcpos/sync-core';

import { useCollectionBinding } from '../../../query';
import { useDefaultCustomerID } from './use-default-customer-id';
import { useGuestCustomer } from '../hooks/use-guest-customer';

export const useDefaultCustomer = () => {
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
					result$.pipe(
						map((result) => (result.hits.length === 1 ? result.hits[0].document : guest))
					)
				)
			),
		[binding.result$, guestCustomer]
	);

	const defaultCustomerResource = React.useMemo(
		() => new ObservableResource(defaultCustomer$),
		[defaultCustomer$]
	);

	return { defaultCustomer$, defaultCustomerResource };
};
