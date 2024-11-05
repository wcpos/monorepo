import * as React from 'react';

import { ObservableResource, useObservable } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { useQuery } from '@wcpos/query';

import { useDefaultCustomerID } from './use-default-customer-id';
import { useGuestCustomer } from '../hooks/use-guest-customer';

/**
 *
 */
export const useDefaultCustomer = () => {
	const guestCustomer = useGuestCustomer();
	const defaultCustomerID = useDefaultCustomerID();

	const query = useQuery({
		queryKeys: ['customers', 'defaultCustomer'],
		collectionName: 'customers',
		initialParams: {
			selector: { id: defaultCustomerID },
		},
		infiniteScroll: true,
	});

	/**
	 *
	 */
	React.useEffect(() => {
		query.where('id').equals(defaultCustomerID).exec();
	}, [defaultCustomerID, query]);

	/**
	 *
	 */
	const defaultCustomer$ = useObservable(
		() =>
			query.result$.pipe(
				map((result) => {
					if (result.count === 1) {
						return result.hits[0].document;
					} else {
						return guestCustomer;
					}
				})
			),
		[query, guestCustomer]
	);

	/**
	 *
	 */
	const defaultCustomerResource = React.useMemo(
		() => new ObservableResource(defaultCustomer$),
		[defaultCustomer$]
	);

	return { defaultCustomer$, defaultCustomerResource };
};
