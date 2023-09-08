import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import Suspense from '@wcpos/components/src/suspense';

import CustomerPill from './customer-pill';
import StatusPill from './status-pill';
import { useGetDocumentByRemoteId } from '../../hooks/use-get-document-by-remote-id';
import { useGuestCustomer } from '../../hooks/use-guest-customer';

const FilterBar = ({ query }) => {
	const customerID = useObservableState(
		query.state$.pipe(map((state) => get(state, ['selector', 'customer_id']))),
		get(query, ['currentState', 'selector', 'customer_id'])
	);
	const guestCustomer = useGuestCustomer();
	const { documentResource: customerResource } = useGetDocumentByRemoteId({
		collectionName: 'customers',
		remoteID: customerID,
		fallback: customerID === 0 ? guestCustomer : null,
	});

	/**
	 *
	 */
	return (
		<Box space="small" horizontal>
			{/* <StatusPill active={statusFilterActive} query={query} /> */}
			<Suspense>
				<CustomerPill resource={customerResource} query={query} />
			</Suspense>
		</Box>
	);
};

export default FilterBar;
