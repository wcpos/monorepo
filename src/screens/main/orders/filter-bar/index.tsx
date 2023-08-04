import * as React from 'react';

import get from 'lodash/get';
import { ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of } from 'rxjs';
import { startWith, switchMap, tap } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import Suspense from '@wcpos/components/src/suspense';

import CustomerPill from './customer-pill';
import StatusPill from './status-pill';
import usePullDocument from '../../contexts/use-pull-document';
import useCollection from '../../hooks/use-collection';

const FilterBar = ({ query }) => {
	const customerCollection = useCollection('customers');
	const statusFilterActive = get(query, ['currentState', 'selector', 'status']);
	const pullDocument = usePullDocument();

	/**
	 * TODO - this is a bit of a hack, but it works for now.
	 * I need to adstarct this to the Query component
	 */
	const selectedCustomerResource = React.useMemo(() => {
		const selectedCategory$ = query.state$.pipe(
			startWith(get(query, ['currentState', 'selector', 'customer_id'])),
			switchMap((query) => {
				const customerID = get(query, ['currentState', 'selector', 'customer_id']);
				if (customerID) {
					return customerCollection.findOne({ selector: { id: customerID } }).$.pipe(
						tap((doc) => {
							if (!isRxDocument(doc)) {
								pullDocument(customerID, customerCollection);
							}
						})
					);
				}
				return of(undefined);
			})
		);

		return new ObservableResource(selectedCategory$);
	}, [customerCollection, pullDocument, query]);

	/**
	 *
	 */
	return (
		<Box space="small" horizontal>
			<StatusPill active={statusFilterActive} query={query} />
			<Suspense>
				<CustomerPill resource={selectedCustomerResource} query={query} />
			</Suspense>
		</Box>
	);
};

export default FilterBar;
