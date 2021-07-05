import * as React from 'react';
import { useObservable, useObservableState, useObservableSuspense } from 'observable-hooks';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import set from 'lodash/set';
import useDataObservable from '@wcpos/common/src/hooks/use-data-observable';
import Segment from '@wcpos/common/src/components/segment';
import Search from '@wcpos/common/src/components/search';
import Text from '@wcpos/common/src/components/text';
import Table from '../../common/table';
import Footer from './footer';
import UiSettings from '../../common/ui-settings';
import cells from './cells';

interface POSProductsProps {
	ui: any;
	storeDB: any;
}

/**
 *
 */
const Products = ({ ui, storeDB }: POSProductsProps) => {
	// const { t } = useTranslation();
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	// @ts-ignore
	const totalRecords = useObservableState(storeDB?.collections.products.totalRecords$);
	const [isSyncing, setIsSyncing] = React.useState<boolean>(false);
	const [recordsShowing, setRecordsShowing] = React.useState<number>(0);
	const { data$, query, setQuery } = useDataObservable('products', {
		search: '',
		sortBy: 'name',
		sortDirection: 'asc',
		filters: {
			category: null,
			tag: null,
		},
	});

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search: string) => {
			setQuery((prev) => ({ ...prev, search }));
		},
		[setQuery]
	);

	/**
	 *
	 */
	const filters = React.useMemo(() => {
		const f = [];
		if (get(query, 'filters.category')) {
			f.push({
				label: get(query, 'filters.category.name'),
				onRemove: () => {
					setQuery((prev: any) => set({ ...prev }, 'filters.category', null));
				},
			});
		}
		if (get(query, 'filters.tag')) {
			f.push({
				label: get(query, 'filters.tag.name'),
				onRemove: () => {
					setQuery((prev: any) => set({ ...prev }, 'filters.tag', null));
				},
			});
		}
		return f;
	}, [query, setQuery]);

	return (
		<Segment.Group>
			<Segment>
				<Search
					label="Search Products"
					placeholder="Search Products"
					value={query.search}
					onSearch={onSearch}
					actions={[<UiSettings ui={ui} />]}
					filters={filters}
				/>
			</Segment>
			<Segment grow>
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
			</Segment>
			<Segment style={{ alignItems: 'flex-end' }}>
				<>
					<Text>
						Showing {recordsShowing} of {totalRecords}
					</Text>
				</>
			</Segment>
		</Segment.Group>
	);
};

export default Products;
