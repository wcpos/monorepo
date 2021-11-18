import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { QueryProvider } from '@wcpos/common/src/hooks/use-query';
import Segment from '@wcpos/common/src/components/segment';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import Table from './table';
import SearchBar from './search-bar';
import * as Styled from './styles';

/**
 *
 */
const Products = () => {
	const resources = useUIResource();
	const ui = useObservableSuspense(resources.products);
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	// useIdAudit('products');
	// useRestQuery('products');

	return (
		<QueryProvider initialQuery={{ sortBy: 'name', sortDirection: 'asc' }}>
			<Segment.Group>
				<Segment>
					<SearchBar ui={ui} />
					{/* <Search
					label="Search Products"
					placeholder="Search Products"
					value={query.search}
					onSearch={onSearch}
					actions={[<UiSettings ui={ui} />]}
					filters={filters}
				/> */}
				</Segment>
				<Segment grow>
					<Table columns={columns} />
				</Segment>
			</Segment.Group>
		</QueryProvider>
	);
};

/**
 *
 */
// const Products = () => {
// 	const { storeDB } = useAppState();
// 	const resources = useUIResource();
// 	const ui = useObservableSuspense(resources.products);
// 	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
// 	// @ts-ignore
// 	const totalRecords = useObservableState(storeDB?.collections.products.totalRecords$);
// 	const [isSyncing, setIsSyncing] = React.useState<boolean>(false);
// 	const [recordsShowing, setRecordsShowing] = React.useState<number>(0);
// 	const { data$, query, setQuery } = useDataObservable('products', {
// 		search: '',
// 		sortBy: 'name',
// 		sortDirection: 'asc',
// 		filters: {
// 			category: null,
// 			tag: null,
// 		},
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

// 	/**
// 	 *
// 	 */
// 	const filters = React.useMemo(() => {
// 		const f = [];
// 		if (get(query, 'filters.category')) {
// 			f.push({
// 				label: get(query, 'filters.category.name'),
// 				onRemove: () => {
// 					setQuery((prev: any) => set({ ...prev }, 'filters.category', null));
// 				},
// 			});
// 		}
// 		if (get(query, 'filters.tag')) {
// 			f.push({
// 				label: get(query, 'filters.tag.name'),
// 				onRemove: () => {
// 					setQuery((prev: any) => set({ ...prev }, 'filters.tag', null));
// 				},
// 			});
// 		}
// 		return f;
// 	}, [query, setQuery]);

// 	return (
// 		<Styled.Container>
// 			<Segment.Group>
// 				<Segment>
// 					<Search
// 						label="Search Products"
// 						placeholder="Search Products"
// 						value={query.search}
// 						onSearch={onSearch}
// 						actions={[<UiSettings ui={ui} />]}
// 						filters={filters}
// 					/>
// 				</Segment>
// 				<Segment grow>
// 					<Table
// 						collection={storeDB.collections.products}
// 						columns={columns}
// 						// @ts-ignore
// 						data$={data$}
// 						setQuery={setQuery}
// 						sortBy={query.sortBy}
// 						sortDirection={query.sortDirection}
// 						cells={cells}
// 					/>
// 				</Segment>
// 				<Segment style={{ alignItems: 'flex-end' }}>
// 					<>
// 						<Text>
// 							Showing {recordsShowing} of {totalRecords}
// 						</Text>
// 					</>
// 				</Segment>
// 			</Segment.Group>
// 		</Styled.Container>
// 	);
// };

export default Products;
