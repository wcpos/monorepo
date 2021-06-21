import * as React from 'react';
import { View, Text } from 'react-native';
import { useObservableState, useObservable, useObservableSuspense } from 'observable-hooks';
import { switchMap, tap, debounceTime, catchError, distinctUntilChanged } from 'rxjs/operators';
import Segment from '@wcpos/common/src/components/segment';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import Button from '@wcpos/common/src/components/button';
import Actions from './actions';
import Table from './table';
import * as Styled from './styles';

type Sort = import('@wcpos/common/src/components/table/types').Sort;
type CustomersScreenProps = import('@wcpos/common/src/navigators/main').CustomersScreenProps;

const Customers = ({ navigation }: CustomersScreenProps) => {
	const { user, storeDB } = useAppState();
	const ui = useObservableSuspense(useUIResource('customers'));
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));

	const onSort: Sort = ({ sortBy, sortDirection }) => {
		console.log({ sortBy, sortDirection });
		// ui.updateWithJson({ sortBy, sortDirection });
	};

	const [query, setQuery] = React.useState({
		search: '',
		sortBy: 'firstName',
		sortDirection: 'asc',
	});

	if (!storeDB) {
		throw Error('something went wrong');
	}

	const customers$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				distinctUntilChanged((a, b) => a[0] === b[0]),
				debounceTime(150),
				switchMap(([q]) => {
					// const regexp = new RegExp(escape(q.search), 'i');
					const regexp = new RegExp('', 'i');
					const RxQuery = storeDB.collections.customers.find();
					// @ts-ignore
					// .sort({ [q.sortBy]: q.sortDirection });
					// .find({
					// 	selector: {
					// 		firstName: { $regex: regexp },
					// 	},
					// })
					// // @ts-ignore
					// .sort({ [q.sortBy]: q.sortDirection });
					return RxQuery.$;
				}),
				catchError((err) => {
					console.error(err);
					return err;
				})
			),
		[query]
	);

	const customers = useObservableState(customers$, []);

	return (
		<Styled.Container>
			<React.Suspense fallback={<Text>loading customers...</Text>}>
				<Segment.Group>
					<Segment>
						<Actions columns={columns} query={query} ui={ui} />
					</Segment>
					<Segment grow>
						<Table
							customers={customers}
							columns={columns}
							sort={onSort}
							sortBy={ui.sortBy}
							sortDirection={ui.sortDirection}
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
						<Button
							title="Fetch customers"
							onPress={() => {
								setQuery({
									search: 'test',
									sortBy: 'firstName',
									sortDirection: 'asc',
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
