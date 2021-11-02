import * as React from 'react';
import { useObservable, useObservableState, useObservableSuspense } from 'observable-hooks';
import { tap, switchMap, catchError, debounceTime, map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import set from 'lodash/set';
// import useIdAudit from '@wcpos/common/src/hooks/use-id-audit';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useIdAudit from '@wcpos/common/src/hooks/use-id-audit';
import Segment from '@wcpos/common/src/components/segment';
import Search from '@wcpos/common/src/components/search';
import Text from '@wcpos/common/src/components/text';
import http from '@wcpos/common/src/lib/http';
import { useNavigation } from '@react-navigation/native';
import { FlatList } from 'react-native';
import Table from './table';
import Footer from './footer';
import UiSettings from '../../common/ui-settings';
import SearchBar from './search-bar';

interface POSProductsProps {
	ui: any;
	storeDB: any;
}

/**
 *
 */
const Products = ({ ui, storeDB }: POSProductsProps) => {
	// const { t } = useTranslation();
	const columns$ = ui.get$('columns');
	const columns = useObservableState(columns$, ui.get('columns'));
	// const totalRecords = useObservableState(storeDB?.products.totalRecords$);
	// const [isSyncing, setIsSyncing] = React.useState<boolean>(false);
	// useIdAudit('products');

	/**
	 *
	 */
	// const onSearch = React.useCallback(
	// 	(search: string) => {
	// 		setQuery('search', search);
	// 	},
	// 	[setQuery]
	// );

	/**
	 *
	 */
	// const filters = React.useMemo(() => {
	// 	const f = [];
	// 	if (get(query, 'filters.category')) {
	// 		f.push({
	// 			label: get(query, 'filters.category.name'),
	// 			onRemove: () => {
	// 				// setQuery((prev: any) => set({ ...prev }, 'filters.category', null));
	// 			},
	// 		});
	// 	}
	// 	if (get(query, 'filters.tag')) {
	// 		f.push({
	// 			label: get(query, 'filters.tag.name'),
	// 			onRemove: () => {
	// 				// setQuery((prev: any) => set({ ...prev }, 'filters.tag', null));
	// 			},
	// 		});
	// 	}
	// 	return f;
	// }, [query, setQuery]);

	return (
		<Segment.Group>
			<Segment>
				<SearchBar />
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
			{/* <Segment grow>
				<Table
					collection={storeDB.collections.products}
					columns={columns}
					// @ts-ignore
					data$={data$}
					setQuery={setQuery}
					sortBy={query.sortBy}
					sortDirection={query.sortDirection}
					cells={cells}
				/>
			</Segment> */}
			<Segment style={{ alignItems: 'flex-end' }}>
				{/* <>
					<Text>
						Showing {count} of {totalRecords}
					</Text>
				</> */}
			</Segment>
		</Segment.Group>
	);
};

export default Products;
