import * as React from 'react';
import { Text } from 'react-native';
import { useObservableState, useObservable, useObservableSuspense } from 'observable-hooks';
import { switchMap, tap, debounceTime, catchError, distinctUntilChanged } from 'rxjs/operators';
import { Observable } from 'rxjs';
import Segment from '@wcpos/common/src/components/segment';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useDataObservable from '@wcpos/common/src/hooks/use-data-observable';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import Button from '@wcpos/common/src/components/button';
import Search from '@wcpos/common/src/components/search';
import Table from '../common/table';
import UiSettings from '../common/ui-settings';
import cells from './cells';
import * as Styled from './styles';

type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
type OrderDocument = import('@wcpos/common/src/database').OrderDocument;
interface QueryState {
	search: string;
	sortBy: string;
	sortDirection: SortDirection;
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const Orders = () => {
	const { storeDB } = useAppState();
	const ui = useObservableSuspense(useUIResource('orders'));
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	const { data$, query, setQuery } = useDataObservable('orders', {
		search: '',
		sortBy: 'dateCreatedGmt',
		sortDirection: 'desc',
	});

	// const [query, setQuery] = React.useState<QueryState>({
	// 	search: '',
	// 	sortBy: 'dateCreatedGmt',
	// 	sortDirection: 'desc',
	// });

	const onSearch = React.useCallback(
		(search: string) => {
			setQuery((prev) => ({ ...prev, search }));
		},
		[setQuery]
	);

	if (!storeDB) {
		throw Error('something went wrong');
	}

	// const orders$ = useObservable(
	// 	(inputs$) =>
	// 		inputs$.pipe(
	// 			distinctUntilChanged((a, b) => a[0] === b[0]),
	// 			debounceTime(150),
	// 			switchMap(([q]) => {
	// 				const regexp = new RegExp(escape(q.search), 'i');
	// 				const RxQuery = storeDB.collections.orders
	// 					.find({
	// 						selector: {
	// 							dateCreatedGmt: { $regex: regexp },
	// 						},
	// 					})
	// 					// @ts-ignore
	// 					.sort({ [q.sortBy]: q.sortDirection });
	// 				return RxQuery.$;
	// 			}),
	// 			catchError((err) => {
	// 				console.error(err);
	// 				return err;
	// 			})
	// 		),
	// 	[query]
	// ) as Observable<OrderDocument[]>;

	return (
		<Styled.Container>
			<React.Suspense fallback={<Text>loading orders...</Text>}>
				<Segment.Group>
					<Segment>
						<Search
							label="Search Orders"
							placeholder="Search Orders"
							value={query.search}
							onSearch={onSearch}
							actions={[<UiSettings ui={ui} />]}
						/>
					</Segment>
					<Segment grow>
						<Table
							collection={storeDB.collections.orders}
							columns={columns}
							// @ts-ignore
							data$={data$}
							setQuery={setQuery}
							sortBy={query.sortBy}
							sortDirection={query.sortDirection}
							cells={cells}
						/>
					</Segment>
					<Segment>
						<Button
							title="Fetch all ids"
							onPress={async () => {
								// @ts-ignore
								const result = await storeDB.httpClient
									.get('orders', {
										params: { fields: ['id', 'firstName', 'lastName'], posts_per_page: -1 },
									})
									.then(({ data }: any) => {
										// @ts-ignore
										return storeDB.collections.orders.auditIdsFromServer(data);
									})
									.catch((err: any) => {
										if (err && err.response && err.response.status === 401) {
											// @ts-ignore
											navigation.navigate('Modal', { login: true });
										}
										console.warn(err);
									});
							}}
						/>
					</Segment>
				</Segment.Group>
			</React.Suspense>
		</Styled.Container>
	);
};

export default Orders;
