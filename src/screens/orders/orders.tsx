import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { QueryProvider } from '@wcpos/common/src/hooks/use-query';
import Segment from '@wcpos/common/src/components/segment';
import useIdAudit from '@wcpos/common/src/hooks/use-id-audit';
import useUIResource from '@wcpos/common/src/hooks/use-ui-resource';
import Table from './table';
import SearchBar from './search-bar';
import UiSettings from '../common/ui-settings';

type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
type OrderDocument = import('@wcpos/common/src/database').OrderDocument;
interface QueryState {
	search: string;
	sortBy: string;
	sortDirection: SortDirection;
}

/**
 *
 */
const Orders = () => {
	const ui = useObservableSuspense(useUIResource('orders'));
	useIdAudit('orders');
	// useRestQuery('products');

	return (
		<QueryProvider initialQuery={{ sortBy: 'dateCreatedGmt', sortDirection: 'asc' }}>
			<Segment.Group>
				<Segment style={{ flexDirection: 'row' }}>
					<SearchBar />
					<UiSettings ui={ui} />
				</Segment>
				<Segment grow>
					<Table ui={ui} />
				</Segment>
			</Segment.Group>
		</QueryProvider>
	);
};

export default Orders;
