import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { QueryProvider } from '@wcpos/common/src/hooks/use-query';
import Segment from '@wcpos/common/src/components/segment';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import Table from './table';
import SearchBar from './search-bar';
import * as Styled from './styles';

// type CustomersScreenProps = import('@wcpos/common/src/navigators/main').CustomersScreenProps;

/**
 *
 */
const Customers = () => {
	const resources = useUIResource();
	const ui = useObservableSuspense(resources.customers);
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	// useIdAudit('products');
	// useRestQuery('products');

	return (
		<QueryProvider initialQuery={{ sortBy: 'lastName', sortDirection: 'asc' }}>
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

// const Customers = ({ navigation }: CustomersScreenProps) => {
// 	const { storeDB } = useAppState();
// 	const resources = useUIResource();
// 	const ui = useObservableSuspense(resources.customers);
// 	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
// 	const { data$, query, setQuery } = useDataObservable('customers', {
// 		search: '',
// 		sortBy: 'lastName',
// 		sortDirection: 'asc',
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

// 	useWhyDidYouUpdate('Customer Page', { data$, query, ui, columns, storeDB, navigation });

// 	return (
// 		<Styled.Container>
// 			<React.Suspense fallback={<Text>loading customers...</Text>}>
// 				<Segment.Group>
// 					<Segment>
// 						<Search
// 							label="Search Customers"
// 							placeholder="Search Customers"
// 							value={query.search}
// 							onSearch={onSearch}
// 							actions={[
// 								{
// 									name: 'add',
// 									action: () => {
// 										console.log('show modal');
// 									},
// 								},
// 								<UiSettings ui={ui} />,
// 							]}
// 						/>
// 					</Segment>
// 					<Segment grow>
// 						<Table
// 							collection={storeDB.collections.customers}
// 							columns={columns}
// 							// @ts-ignore
// 							data$={data$}
// 							setQuery={setQuery}
// 							sortBy={query.sortBy}
// 							sortDirection={query.sortDirection}
// 							cells={cells}
// 						/>
// 					</Segment>
// 					<Segment />
// 				</Segment.Group>
// 			</React.Suspense>
// 		</Styled.Container>
// 	);
// };

export default Customers;
