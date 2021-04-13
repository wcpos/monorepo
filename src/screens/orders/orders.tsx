import * as React from 'react';
import { View, Text } from 'react-native';
import { useObservableState, useObservable, useObservableSuspense } from 'observable-hooks';
import { switchMap, tap, debounceTime, catchError, distinctUntilChanged } from 'rxjs/operators';
import Segment from '@wcpos/common/src/components/segment';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import Button from '@wcpos/common/src/components/button';
import Table from './table';
import Actions from './actions';

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

	const query = storeDB.collections.orders.find();
	const orders = useObservableState(query.$, []);

	return (
		<React.Suspense fallback={<Text>loading orders...</Text>}>
			<Segment.Group>
				<Segment>
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
						title="Fetch orders"
						onPress={async () => {
							// @ts-ignore
							const replicationState = storeDB.orders.syncRestApi({
								url: 'orders',
								pull: {},
							});
							replicationState.run(false);
						}}
					/>
					<Button
						title="Insert new order"
						onPress={async () => {
							// @ts-ignore
							storeDB.collections.orders.insert({
								id: 1234,
								number: '1234',
								line_items: [{ name: 'Test', price: 8 }],
							});
						}}
					/>
				</Segment>
			</Segment.Group>
		</React.Suspense>
	);
};

export default Orders;
