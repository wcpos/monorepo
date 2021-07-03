import * as React from 'react';
import { useObservable, useObservableState, useObservableSuspense } from 'observable-hooks';
import {
	switchMap,
	tap,
	debounceTime,
	catchError,
	distinctUntilChanged,
	share,
} from 'rxjs/operators';
import { Observable } from 'rxjs';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import filter from 'lodash/filter';
import sortBy from 'lodash/sortBy';
import map from 'lodash/map';
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
	category: any;
	tag: any;
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

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search: string) => {
			setQuery({ ...query, search });
		},
		[query]
	);

	/**
	 *
	 */
	const products$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				distinctUntilChanged((a, b) => a[0] === b[0]),
				debounceTime(150),
				// @ts-ignore
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
				const filtered = filter(result.docs, 'dateCreatedGmt');
				const sorted = sortBy(filtered, 'dateCreatedGmt');
				const exclude = map(sorted, 'id').join(',');

				const replicationState = storeDB.collections.products.syncRestApi({
					live: false,
					autoStart: false,
					pull: {
						queryBuilder: (lastModified: any) => {
							const orderby = query.sortBy === 'name' ? 'title' : query.sortBy;
							return {
								order: query.sortDirection,
								orderby,
								exclude,
								category: get(query.category, 'id'),
								tag: get(query.tag, 'id'),
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
