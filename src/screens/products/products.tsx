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
import _map from 'lodash/map';
import _findIndex from 'lodash/findIndex';
import _pullAt from 'lodash/pullAt';
import Segment from '@wcpos/common/src/components/segment';
import Text from '@wcpos/common/src/components/text';
import Button from '@wcpos/common/src/components/button';
import Dialog from '@wcpos/common/src/components/dialog';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import useAuthLogin from '@wcpos/common/src/hooks/use-auth-login';
import Search from '@wcpos/common/src/components/search';
import Table from '../common/table';
import UiSettings from '../common/ui-settings';
import Row from './table/rows/row';
import * as Styled from './styles';

type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
interface QueryState {
	search: string;
	sortBy: string;
	sortDirection: SortDirection;
}
interface RecordsMap {
	_id: string; // local ID
	id: number; // remote ID
	dateModifiedGmt: string; // updated_at
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const Products = () => {
	const { storeDB } = useAppState();
	const ui = useObservableSuspense(useUIResource('products'));
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	const [isSyncing, setIsSyncing] = React.useState<boolean>(false);
	const [allRecords, setAllRecords] = React.useState<RecordsMap[]>([]);
	const [recordsShowing, setRecordsShowing] = React.useState<number>(0);

	const [query, setQuery] = React.useState<QueryState>({
		search: '',
		sortBy: 'name',
		sortDirection: 'asc',
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
				switchMap(([q]) => {
					const regexp = new RegExp(escape(q.search), 'i');
					const RxQuery = storeDB.collections.products
						.find({
							selector: {
								name: { $regex: regexp },
							},
						})
						// @ts-ignore
						.sort({ [q.sortBy]: q.sortDirection });
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
	);

	// first render
	React.useEffect(() => {
		async function countRecordsTotal() {
			if (storeDB) {
				const result = await storeDB.collections.products.pouch
					.find({
						selector: {},
						// @ts-ignore
						fields: ['_id', 'id', 'dateCreatedGmt'],
					})
					.catch((err) => {
						console.log(err);
					});

				if (result) {
					setAllRecords(result.docs);

					if (result.docs.length === 0) {
						// @ts-ignore
						const { data } = await storeDB.httpClient.get('products', {
							params: { fields: ['id', 'name'], posts_per_page: -1 },
						});
						// @ts-ignore
						await storeDB.collections.products.auditIdsFromServer(data);
					}
				}
			}
		}

		countRecordsTotal();
	}, []);

	// listen to changes in collection
	const updated = useObservableState(
		storeDB.collections.products.$.pipe(
			tap((results) => {
				switch (results.operation) {
					case 'INSERT':
						setAllRecords((prev) => {
							prev.push({
								_id: results.documentData._id,
								id: results.documentData.id,
								dateModifiedGmt: results.documentData.dateModifiedGmt,
							});
							return prev;
						});
						break;
					case 'DELETE':
						setAllRecords((prev) => {
							const removeIndex = _findIndex(prev, { _id: results.documentData._id });
							if (removeIndex !== -1) {
								_pullAt(prev, removeIndex);
							}
							return prev;
						});
						break;
					case 'UPDATE':
						setAllRecords((prev) => {
							const updateIndex = _findIndex(prev, { _id: results.documentData._id });
							prev.splice(updateIndex, 1, {
								_id: results.documentData._id,
								id: results.documentData.id,
								dateModifiedGmt: results.documentData.dateModifiedGmt,
							});
							return prev;
						});
						break;
					default:
						break;
				}
			})
		)
	);

	return (
		<Styled.Container>
			<Segment.Group>
				<Segment>
					<Search
						label="Search Customers"
						placeholder="Search Customers"
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
						RowComponent={Row}
					/>
				</Segment>
				<Segment style={{ alignItems: 'flex-end' }}>
					<>
						<Text>
							Showing {recordsShowing} of {allRecords.length}
						</Text>
					</>
				</Segment>
			</Segment.Group>
		</Styled.Container>
	);
};

export default Products;
