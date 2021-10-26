import * as React from 'react';
import { useObservable, useObservableState, useObservableSuspense } from 'observable-hooks';
import { tap, switchMap, catchError } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import set from 'lodash/set';
// import useDataObservable from '@wcpos/common/src/hooks/use-data-observable';
// import useIdAudit from '@wcpos/common/src/hooks/use-id-audit';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useIdAudit from '@wcpos/common/src/hooks/use-id-audit';
import Segment from '@wcpos/common/src/components/segment';
import Search from '@wcpos/common/src/components/search';
import Text from '@wcpos/common/src/components/text';
import http from '@wcpos/common/src/lib/http';
import { useNavigation } from '@react-navigation/native';
import Table from '../../common/table';
import Footer from './footer';
import UiSettings from '../../common/ui-settings';
import cells from './cells';

interface POSProductsProps {
	ui: any;
	storeDB: any;
}

const useProductQuery = () => {
	const { storeDB } = useAppState();
	const [query, setQuery] = React.useState({
		search: '',
		sortBy: 'name',
		sortDirection: 'asc',
		filters: {
			category: null,
			tag: null,
		},
	});

	const data$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				// distinctUntilChanged((a, b) => a[0] === b[0]),
				// debounceTime(150),
				switchMap(([q]) => {
					// const regexp = new RegExp(escape(q.search), 'i');
					// @ts-ignore
					const RxQuery = storeDB.products.query(q);
					// 	.find({
					// 		selector: {
					// 			dateCreatedGmt: { $regex: regexp },
					// 		},
					// 	})
					// 	// @ts-ignore
					// 	.sort({ [q.sortBy]: q.sortDirection });
					return RxQuery.$;
				}),
				// shareReplay(1),
				catchError((err) => {
					console.error(err);
					return err;
				})
			),
		[query]
	);

	return { data$, query, setQuery };
};

/**
 *
 */
const Products = ({ ui, storeDB }: POSProductsProps) => {
	// const { t } = useTranslation();
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	// @ts-ignore
	const totalRecords = useObservableState(storeDB?.products.totalRecords$);
	const [isSyncing, setIsSyncing] = React.useState<boolean>(false);
	const [recordsShowing, setRecordsShowing] = React.useState<number>(0);
	const { data$, query, setQuery } = useProductQuery();
	const products = useObservableState(data$, []);
	useIdAudit('products');
	console.log(products);
	// const { data$, query, setQuery } = useDataObservable('products', {
	// 	search: '',
	// 	sortBy: 'name',
	// 	sortDirection: 'asc',
	// 	filters: {
	// 		category: null,
	// 		tag: null,
	// 	},
	// });
	// useIdAudit('products');

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
