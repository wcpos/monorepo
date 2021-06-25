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
import cells from './cells';
import * as Styled from './styles';

type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
type ProductDocument = import('@wcpos/common/src/database').ProductDocument;
interface QueryState {
	search: string;
	sortBy: string;
	sortDirection: SortDirection;
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
				tap(([q]) => {
					console.log(q);
					// if collection is not fully synced, fetch query from server
				}),
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
	) as Observable<ProductDocument[]>;

	// first render
	React.useEffect(() => {
		// @ts-ignore
		storeDB.httpClient
			.get('products', {
				params: { fields: ['id', 'name'], posts_per_page: -1 },
			})
			.then((result: any) => {
				// @ts-ignore
				storeDB.collections.products.auditIdsFromServer(result.data);
			});
	}, []);

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
		</Styled.Container>
	);
};

export default Products;
