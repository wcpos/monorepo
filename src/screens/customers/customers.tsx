import * as React from 'react';
import { View, Text } from 'react-native';
import { Observable } from 'rxjs';
import {
	useObservableState,
	useObservable,
	useObservableSuspense,
	useSubscription,
} from 'observable-hooks';
import {
	switchMap,
	tap,
	throttleTime,
	catchError,
	distinctUntilChanged,
	shareReplay,
	first,
} from 'rxjs/operators';
import _get from 'lodash/get';
import _filter from 'lodash/filter';
import _sortBy from 'lodash/sortBy';
import _flatten from 'lodash/flatten';
import _map from 'lodash/map';
import Segment from '@wcpos/common/src/components/segment';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import Button from '@wcpos/common/src/components/button';
import Search from '@wcpos/common/src/components/search';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Table from '../common/table';
import UiSettings from '../common/ui-settings';
import cells from './cells';
import * as Styled from './styles';

type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
type CustomersScreenProps = import('@wcpos/common/src/navigators/main').CustomersScreenProps;
type CustomerDocument = import('@wcpos/common/src/database').CustomerDocument;
interface QueryState {
	search: string;
	sortBy: string;
	sortDirection: SortDirection;
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const Customers = ({ navigation }: CustomersScreenProps) => {
	const { user, storeDB } = useAppState();
	const ui = useObservableSuspense(useUIResource('customers'));
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));

	const [query, setQuery] = React.useState<QueryState>({
		search: '',
		sortBy: 'lastName',
		sortDirection: 'asc',
	});

	const onSearch = React.useCallback(
		(search: string) => {
			setQuery({ ...query, search });
		},
		[query]
	);

	// const onSearch = (search: string) => {
	// 	setQuery({ ...query, search });
	// };

	if (!storeDB) {
		throw Error('something went wrong');
	}

	const customers$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				// distinctUntilChanged((a, b) => a[0] === b[0]),
				// throttleTime(150),
				switchMap(([q]) => {
					const regexp = new RegExp(escape(q.search), 'i');
					const RxQuery = storeDB.collections.customers
						// @ts-ignore
						.find({
							selector: {
								$or: [
									{ username: { $regex: regexp } },
									{ firstName: { $regex: regexp } },
									{ lastName: { $regex: regexp } },
								],
								// $and: [{ [q.sortBy]: { $exists: false } }],
							},
						})
						// @ts-ignore
						.sort({ [q.sortBy]: q.sortDirection });
					return RxQuery.$;
				}),
				// throttleTime(150),
				catchError((err) => {
					console.error(err);
					return err;
				})
			),
		[query]
	) as Observable<CustomerDocument[]>;

	const sharedCustomers$ = customers$.pipe(shareReplay(1));
	const subscription = useSubscription(sharedCustomers$.pipe(first()), (result) => {
		// if first and empty
		if (result.length === 0) {
			// @ts-ignore
			storeDB.httpClient
				.get('customers', {
					params: { fields: ['id', 'firstName', 'lastName'], posts_per_page: -1 },
				})
				.then(({ data }: any) => {
					// @ts-ignore
					return storeDB.collections.customers.auditIdsFromServer(data);
				})
				.catch((err: any) => {
					if (err && err.response && err.response.status === 401) {
						// @ts-ignore
						navigation.navigate('Modal', { login: true });
					}
					console.warn(err);
				});
		}
	});

	/**
	 *
	 */
	React.useEffect(() => {
		storeDB.collections.customers.pouch
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
				const replicationState = storeDB.collections.customers.syncRestApi({
					live: false,
					autoStart: false,
					pull: {
						queryBuilder: (lastModified: any) => {
							const orderbyMap = {
								lastName: 'meta_value',
								firstName: 'meta_value',
							};

							const metaKeyMap = {
								lastName: 'last_name',
								firstName: 'first_name',
							};

							// @ts-ignore
							const orderby = orderbyMap[query.sortBy] ? orderbyMap[query.sortBy] : query.sortBy;
							// @ts-ignore
							const meta_key = metaKeyMap[query.sortBy] ? metaKeyMap[query.sortBy] : undefined;

							return {
								search: escape(query.search),
								order: query.sortDirection,
								orderby,
								exclude,
								meta_key,
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

	useWhyDidYouUpdate('Customer Page', { customers$, query, ui, columns, storeDB, navigation });

	return (
		<Styled.Container>
			<React.Suspense fallback={<Text>loading customers...</Text>}>
				<Segment.Group>
					<Segment>
						<Search
							label="Search Customers"
							placeholder="Search Customers"
							value={query.search}
							onSearch={onSearch}
							actions={[
								{
									name: 'add',
									action: () => {
										console.log('show modal');
									},
								},
								<UiSettings ui={ui} />,
							]}
						/>
					</Segment>
					<Segment grow>
						<Table
							collection={storeDB.collections.customers}
							columns={columns}
							data$={sharedCustomers$}
							setQuery={setQuery}
							sortBy={query.sortBy}
							sortDirection={query.sortDirection}
							cells={cells}
						/>
					</Segment>
					<Segment />
				</Segment.Group>
			</React.Suspense>
		</Styled.Container>
	);
};

export default Customers;
