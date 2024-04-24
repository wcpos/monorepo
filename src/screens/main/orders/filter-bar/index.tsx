import * as React from 'react';

import { useFocusEffect } from '@react-navigation/native';
import get from 'lodash/get';
import { useObservableState, ObservableResource, useObservable } from 'observable-hooks';
import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import Suspense from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import CustomerPill from './customer-pill';
import StatusPill from './status-pill';
import { useGuestCustomer } from '../../hooks/use-guest-customer';

const FilterBar = ({ query }) => {
	const guestCustomer = useGuestCustomer();
	const customerID = useObservableState(
		query.params$.pipe(map((params) => get(params, ['selector', 'customer_id']))),
		get(query.getParams(), ['selector', 'customer_id'])
	);

	/**
	 *
	 */
	const customerQuery = useQuery({
		queryKeys: ['customers', 'order-filter'],
		collectionName: 'customers',
	});

	/**
	 *
	 */
	React.useEffect(() => {
		if (customerID) {
			customerQuery.where('id', customerID);
		}
	}, [customerID, customerQuery]);

	/**
	 *
	 */
	const selectedCustomer$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([id]) => {
					if (id === 0) {
						return of(guestCustomer);
					}
					if (!id) {
						return of(null);
					}
					return customerQuery.result$.pipe(
						map((result) => {
							if (result.count === 1) return result.hits[0].document;
						})
					);
				})
			),
		[customerID]
	);

	/**
	 *
	 */
	const customerResource = React.useMemo(
		() => new ObservableResource(selectedCustomer$),
		[selectedCustomer$]
	);

	/**
	 *
	 */
	return (
		<Box space="small" horizontal>
			<StatusPill query={query} />
			<Suspense>
				<CustomerPill resource={customerResource} query={query} />
			</Suspense>
		</Box>
	);
};

export default FilterBar;
