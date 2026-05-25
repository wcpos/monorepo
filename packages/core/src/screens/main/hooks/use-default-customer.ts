import * as React from 'react';

import { ObservableResource, useObservable } from 'observable-hooks';
import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

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
	 * Execute query when defaultCustomerID changes
	 * Needed to fetch the customer document from RxDB
	 */
	React.useEffect(() => {
		query?.where('id').equals(defaultCustomerID).exec();
	}, [defaultCustomerID, query]);

	/**
	 *
	 */
	const defaultCustomer$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([result$, guestCustomer]) => {
					if (!result$) {
						return of(guestCustomer);
					}

					return result$.pipe(
						map((result) => {
							if (result.count === 1) {
								return result.hits[0].document;
							}

							return guestCustomer;
						})
					);
				})
			),
		[query?.result$, guestCustomer]
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
