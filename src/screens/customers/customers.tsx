import * as React from 'react';
import { View, Text } from 'react-native';
import { useObservableState, useObservable, useObservableSuspense } from 'observable-hooks';
import { switchMap, tap, throttleTime, catchError, distinctUntilChanged } from 'rxjs/operators';
import Segment from '@wcpos/common/src/components/segment';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import Button from '@wcpos/common/src/components/button';
import Search from '@wcpos/common/src/components/search';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Table from './table';
import UiSettings from '../common/ui-settings';
import * as Styled from './styles';

type Sort = import('@wcpos/common/src/components/table/types').Sort;
type CustomersScreenProps = import('@wcpos/common/src/navigators/main').CustomersScreenProps;

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const Customers = ({ navigation }: CustomersScreenProps) => {
	const { user, storeDB } = useAppState();
	const ui = useObservableSuspense(useUIResource('customers'));
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));

	const [query, setQuery] = React.useState({
		search: '',
		sortBy: 'lastName',
		sortDirection: 'asc',
		filter: {
			role: [],
		},
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
							},
						});
					// @ts-ignore
					// .sort({ [q.sortBy]: q.sortDirection });
					return RxQuery.$;
				}),
				// throttleTime(150),
				catchError((err) => {
					console.error(err);
					return err;
				})
			),
		[query]
	);

	// const customers = useObservableState(customers$, []);

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
							customers$={customers$}
							columns={columns}
							setQuery={setQuery}
							sortBy={query.sortBy}
							// @ts-ignore
							sortDirection={query.sortDirection}
						/>
					</Segment>
					<Segment>
						<Button
							title="Fetch all ids"
							onPress={async () => {
								// @ts-ignore
								const result = await storeDB.httpClient
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
							}}
						/>
					</Segment>
				</Segment.Group>
			</React.Suspense>
		</Styled.Container>
	);
};

export default Customers;
