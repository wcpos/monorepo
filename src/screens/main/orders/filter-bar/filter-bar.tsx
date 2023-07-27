import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, ObservableResource, useObservable } from 'observable-hooks';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import Suspense from '@wcpos/components/src/suspense';

import CustomerPill from './customer-pill';
import StatusPill from './status-pill';
import { useOrders } from '../../contexts/orders';
import useCollection from '../../hooks/use-collection';

const FilterBar = () => {
	const { query$, setQuery } = useOrders();
	const query = useObservableState(query$, query$.getValue());
	const { collection } = useCollection('customers');
	const customerID = get(query, ['selector', 'customer_id']);
	const statusFilterActive = get(query, ['selector', 'status']);

	// const pullDocument = usePullDocument();

	/**
	 *
	 */
	const selectedCustomer$ = useObservable(
		(input$) =>
			input$.pipe(
				switchMap(([catID]) =>
					catID ? collection.findOne({ selector: { id: catID } }).$ : of(undefined)
				)
			),
		[customerID]
	);

	/**
	 *
	 */
	const selectedCustomerResource = React.useMemo(() => {
		return new ObservableResource(selectedCustomer$);
	}, [selectedCustomer$]);

	/**
	 *
	 */
	return (
		<Box space="small" horizontal>
			<StatusPill active={statusFilterActive} setQuery={setQuery} />
			<Suspense>
				<CustomerPill selectedCustomerResource={selectedCustomerResource} setQuery={setQuery} />
			</Suspense>
		</Box>
	);
};

export default FilterBar;
