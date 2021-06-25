import * as React from 'react';
import { useObservable, useObservableState, useObservableSuspense } from 'observable-hooks';
import {
	switchMap,
	tap,
	debounceTime,
	catchError,
	distinctUntilChanged,
	share,
	map,
} from 'rxjs/operators';
import { Observable } from 'rxjs';
import { useTranslation } from 'react-i18next';
import forEach from 'lodash/forEach';
import Segment from '@wcpos/common/src/components/segment';
import Search from '@wcpos/common/src/components/search';
import Text from '@wcpos/common/src/components/text';
import Table from '../../common/table';
import Footer from './footer';
import UiSettings from '../../common/ui-settings';
import cells from './cells';

type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
type ProductDocument = import('@wcpos/common/src/database').ProductDocument;
interface QueryState {
	search: string;
	sortBy: string;
	sortDirection: SortDirection;
	filter: any;
}
interface POSProductsProps {
	ui: any;
	storeDB: any;
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

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

	const [query, setQuery] = React.useState<QueryState>({
		search: '',
		sortBy: 'name',
		sortDirection: 'asc',
		filter: {
			categories: [],
			tags: [],
		},
	});

	const onSearch = React.useCallback(
		(search: string) => {
			setQuery({ ...query, search });
		},
		[query]
	);

	const products$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				distinctUntilChanged((a, b) => a[0] === b[0]),
				debounceTime(150),
				// @ts-ignore
				switchMap(([q]) => {
					console.log(q);
					const regexp = new RegExp(escape(q.search), 'i');
					const selector = {
						name: { $regex: regexp },
						// categories: { $elemMatch: { id: 20 } },
					};
					forEach(q.filter, (value, key) => {
						if (value.length > 0) {
							// @ts-ignore
							selector[key] = { $elemMatch: { id: value[0].id } };
						}
					});
					const RxQuery = storeDB.collections.products
						.find({ selector })
						.sort({ [q.sortBy]: q.sortDirection });
					return RxQuery.$;
				}),
				catchError((err) => {
					console.error(err);
					return err;
				})
			),
		[query]
	) as Observable<ProductDocument[]>;

	return (
		<Segment.Group>
			<Segment>
				<Search
					label="Search Products"
					placeholder="Search Products"
					value={query.search}
					onSearch={onSearch}
					actions={[<UiSettings ui={ui} />]}
				/>
			</Segment>
			<Segment grow>
				<Table
					collectionName="products"
					columns={columns}
					data$={products$}
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
