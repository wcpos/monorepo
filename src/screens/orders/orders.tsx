import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { QueryProvider } from '@wcpos/common/src/hooks/use-query';
import Segment from '@wcpos/common/src/components/segment';
import useIdAudit from '@wcpos/common/src/hooks/use-id-audit';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import Table from './table';
import SearchBar from './search-bar';

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
	const resources = useUIResource();
	const ui = useObservableSuspense(resources.orders);
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	useIdAudit('orders');
	// useRestQuery('products');

	return (
		<QueryProvider initialQuery={{ sortBy: 'dateCreatedGmt', sortDirection: 'asc' }}>
			<Segment.Group>
				<Segment>
					<SearchBar ui={ui} />
				</Segment>
				<Segment grow>
					<Table columns={columns} />
				</Segment>
			</Segment.Group>
		</QueryProvider>
	);
};

// const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

// const Orders = () => {
// 	const { storeDB } = useAppState();
// 	const resources = useUIResource();
// 	const ui = useObservableSuspense(resources.orders);
// 	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
// 	const { data$, query, setQuery } = useDataObservable('orders', {
// 		search: '',
// 		sortBy: 'dateCreatedGmt',
// 		sortDirection: 'desc',
// 	});

// 	const onSearch = React.useCallback(
// 		(search: string) => {
// 			setQuery((prev) => ({ ...prev, search }));
// 		},
// 		[setQuery]
// 	);

// 	if (!storeDB) {
// 		throw Error('something went wrong');
// 	}

// 	return (
// 		<QueryProvider initialQuery={{ sortBy: 'dateCreatedGmt', sortDirection: 'desc' }}>
// 			<Styled.Container>
// 				<React.Suspense fallback={<Text>loading orders...</Text>}>
// 					<Segment.Group>
// 						<Segment>
// 							<Search
// 								label="Search Orders"
// 								placeholder="Search Orders"
// 								value={query.search}
// 								onSearch={onSearch}
// 								actions={[<UiSettings ui={ui} />]}
// 							/>
// 						</Segment>
// 						<Segment grow>
// 							<Table
// 								collection={storeDB.collections.orders}
// 								columns={columns}
// 								// @ts-ignore
// 								data$={data$}
// 								setQuery={setQuery}
// 								sortBy={query.sortBy}
// 								sortDirection={query.sortDirection}
// 								cells={cells}
// 							/>
// 						</Segment>
// 						<Segment />
// 					</Segment.Group>
// 				</React.Suspense>
// 			</Styled.Container>
// 		</QueryProvider>
// 	);
// };

export default Orders;
