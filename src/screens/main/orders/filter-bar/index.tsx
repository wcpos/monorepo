import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, ObservableResource } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import Suspense from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import CustomerPill from './customer-pill';
import StatusPill from './status-pill';
import { useGuestCustomer } from '../../hooks/use-guest-customer';

const FilterBar = ({ query }) => {
	const customerID = useObservableState(
		query.params$.pipe(map((params) => get(params, ['selector', 'customer_id']))),
		get(query.getParams(), ['selector', 'customer_id'])
	);

	/**
	 *
	 */
	const customerQuery = useQuery({
		queryKeys: ['customers', { id: customerID }],
		collectionName: 'customers',
		initialParams: {
			selector: { id: customerID },
		},
	});

	/**
	 *
	 */
	const customerResource = React.useMemo(
		() =>
			new ObservableResource(customerQuery.result$.pipe(map((result) => result.hits[0].document))),
		[customerQuery.result$]
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
