import * as React from 'react';
import { View, Text } from 'react-native';
import { useObservableState, useObservable, useObservableSuspense } from 'observable-hooks';
import { switchMap, tap, debounceTime, catchError, distinctUntilChanged } from 'rxjs/operators';
import Segment from '@wcpos/common/src/components/segment';
import Input from '@wcpos/common/src/components/textinput';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import Button from '@wcpos/common/src/components/button';
import Table from './table';
import Actions from './actions';
import * as Styled from './styles';

type Sort = import('@wcpos/common/src/components/table/types').Sort;

const Orders = () => {
	const { storeDB } = useAppState();
	const ui = useObservableSuspense(useUIResource('orders'));
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));

	const onSort: Sort = ({ sortBy, sortDirection }) => {
		console.log({ sortBy, sortDirection });
		// ui.updateWithJson({ sortBy, sortDirection });
	};

	// const [query, setQuery] = React.useState({
	// 	search: '',
	// 	sortBy: 'dateCreatedGmt',
	// 	sortDirection: 'desc',
	// });

	if (!storeDB) {
		throw Error('something went wrong');
	}

	// const orders$ = useObservable(
	// 	// A stream of React elements!
	// 	(inputs$) =>
	// 		inputs$.pipe(
	// 			distinctUntilChanged((a, b) => a[0] === b[0]),
	// 			debounceTime(150),
	// 			switchMap(([q]) => {
	// 				const regexp = new RegExp(escape(q.search), 'i');
	// 				const RxQuery = storeDB.collections.orders
	// 					.find()
	// 					// .find({
	// 					// 	selector: {
	// 					// 		name: { $regex: regexp },
	// 					// 	},
	// 					// })
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
	// );

	const onSearch = (value: string) => {
		console.log(value);
	};

	const query = storeDB.collections.orders.find();
	const orders = useObservableState(query.$, []);

	return (
		<Styled.Container>
			<React.Suspense fallback={<Text>loading orders...</Text>}>
				<Segment.Group>
					<Segment>
						<Input
							label="Search orders"
							placeholder="Search orders"
							onChange={onSearch}
							hideLabel
						/>
						<Actions ui={ui} columns={columns} />
					</Segment>
					<Segment grow>
						<Table
							orders={orders}
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
