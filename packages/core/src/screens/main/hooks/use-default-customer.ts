import * as React from 'react';

import { ObservableResource, useObservable } from 'observable-hooks';
import { map, switchMap } from 'rxjs/operators';

import { useCollectionBinding } from '../../../query';
import { useDefaultCustomerID } from './use-default-customer-id';
import { useGuestCustomer } from '../hooks/use-guest-customer';

export const useDefaultCustomer = () => {
	const guestCustomer = useGuestCustomer();
	const defaultCustomerID = useDefaultCustomerID();
	const binding = useCollectionBinding(
		'customers',
		{
			search: '',
			filters: {},
			sort: { field: 'id', direction: 'asc' },
			limit: 1,
		},
		{ wooIds: [defaultCustomerID] }
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
