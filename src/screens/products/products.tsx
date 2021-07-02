import * as React from 'react';
import { useObservable, useObservableState, useObservableSuspense } from 'observable-hooks';
import { switchMap, tap, catchError, map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import _get from 'lodash/get';
import _filter from 'lodash/filter';
import _sortBy from 'lodash/sortBy';
import _flatten from 'lodash/flatten';
import _map from 'lodash/map';
import Segment from '@wcpos/common/src/components/segment';
import Text from '@wcpos/common/src/components/text';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import Search from '@wcpos/common/src/components/search';
import Table from '../common/table';
import UiSettings from '../common/ui-settings';
import cells from './cells';
import * as Styled from './styles';

type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
type ProductDocument = import('@wcpos/common/src/database').ProductDocument;
interface QueryState {
	search: string;
	sortBy: string;
	sortDirection: SortDirection;
	category: any;
	tag: any;
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const Products = () => {
	const { storeDB } = useAppState();
	const ui = useObservableSuspense(useUIResource('products'));
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	// @ts-ignore
	const totalRecords = useObservableState(storeDB?.collections.products.totalRecords$);
	const [isSyncing, setIsSyncing] = React.useState<boolean>(false);
	const [recordsShowing, setRecordsShowing] = React.useState<number>(0);

	/**
	 *
	 */
	const [query, setQuery] = React.useState<QueryState>({
		search: '',
		sortBy: 'name',
		sortDirection: 'asc',
		category: null,
		tag: null,
	});

	const onSearch = React.useCallback(
		(search: string) => {
			setQuery({ ...query, search });
		},
		[query]
	);

	if (!storeDB) {
		throw Error('something went wrong');
	}

	const products$ = useObservable(
		// A stream of React elements!
		(inputs$) =>
			inputs$.pipe(
				// distinctUntilChanged((a, b) => a[0] === b[0]),
				// debounceTime(150),
				tap(([q]) => {
					console.log(q);
					// if collection is not fully synced, fetch query from server
				}),
				switchMap(([q]) => {
					const regexp = new RegExp(escape(q.search), 'i');
					const selector = {
						name: { $regex: regexp },
						// categories: { $elemMatch: { id: 20 } },
					};
					if (q.category) {
						// @ts-ignore
						selector.categories = { $elemMatch: { id: q.category.id } };
					}
					if (q.tag) {
						// @ts-ignore
						selector.tags = { $elemMatch: { id: q.tag.id } };
					}

					const RxQuery = storeDB.collections.products.find({ selector });
					const indexes = _flatten(storeDB.collections.products.schema.indexes);
					if (indexes.includes(q.sortBy)) {
						const sortedRxQuery = RxQuery.sort({ [q.sortBy]: q.sortDirection });
						return sortedRxQuery.$;
					}
					return RxQuery.$;
				}),
				tap((records) => {
					setRecordsShowing(records.length);
				}),
				catchError((err) => {
					console.error(err);
					return err;
				})
			),
		[query]
	) as Observable<ProductDocument[]>;

	// first render
	// React.useEffect(() => {
	// 	// @ts-ignore
	// 	storeDB.httpClient
	// 		.get('products', {
	// 			params: { fields: ['id', 'name'], posts_per_page: -1 },
	// 		})
	// 		.then((result: any) => {
	// 			// @ts-ignore
	// 			storeDB.collections.products.auditIdsFromServer(result.data);
	// 		});
	// }, []);

	/**
	 *
	 */
	React.useEffect(() => {
		storeDB.collections.products.pouch
			.find({
				selector: {},
				// @ts-ignore
				fields: ['_id', 'id', 'dateCreatedGmt'],
			})
			.then((result: any) => {
				// get array of sorted records with dateCreatedGmt
				const filtered = _filter(result.docs, 'dateCreatedGmt');
				const sorted = _sortBy(filtered, 'dateCreatedGmt');
				const exclude = _map(sorted, 'id').join(',');

				// @ts-ignore
				const replicationState = storeDB.collections.products.syncRestApi({
					live: false,
					autoStart: false,
					pull: {
						queryBuilder: (lastModified: any) => {
							const orderbyMap = {
								name: 'title',
								dateCreated: 'date',
							};
							// @ts-ignore
							const orderby = orderbyMap[query.sortBy] ? orderbyMap[query.sortBy] : query.sortBy;
							return {
								search: escape(query.search),
								order: query.sortDirection,
								orderby,
								exclude,
								category: _get(query.category, 'id'),
								tag: _get(query.tag, 'id'),
							};
						},
					},
				});
				replicationState.run(false);
			})
			.catch((err: any) => {
				console.log(err);
			});
	}, [query]);

	/**
	 *
	 */
	const filters = React.useMemo(() => {
		const f = [];
		if (query.category) {
			f.push({
				label: query.category.name,
				onRemove: () => {
					const category = undefined;
					setQuery({ ...query, category });
				},
			});
		}
		if (query.tag) {
			f.push({
				label: query.tag.name,
				onRemove: () => {
					const tag = undefined;
					setQuery({ ...query, tag });
				},
			});
		}
		return f;
	}, [query]);

	return (
		<Styled.Container>
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
		</Styled.Container>
	);
};

export default Products;
