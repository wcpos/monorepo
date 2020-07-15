import React from 'react';
import { View, Text } from 'react-native';
import { useObservableState, useObservable } from 'observable-hooks';
import { switchMap, tap, debounceTime, catchError, distinctUntilChanged } from 'rxjs/operators';
import Segment from '../../components/segment';
import Table from './table';
import Actions from './actions';
import useAppState from '../../hooks/use-app-state';
import Button from '../../components/button';
import WcApiService from '../../services/wc-api';

interface Props {}

const Orders: React.FC<Props> = () => {
	const [{ user, storeDB }] = useAppState();
	const ui = storeDB.getUI('orders');

	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));

	const onSort = ({ sortBy, sortDirection }) => {
		console.log({ sortBy, sortDirection });
		// ui.updateWithJson({ sortBy, sortDirection });
	};

	const [query, setQuery] = React.useState({
		search: '',
		sortBy: 'id',
		sortDirection: 'asc',
	});

	const orders$ = useObservable(
		// A stream of React elements!
		(inputs$) =>
			inputs$.pipe(
				distinctUntilChanged((a, b) => a[0] === b[0]),
				debounceTime(150),
				switchMap(([q]) => {
					const regexp = new RegExp(escape(q.search), 'i');
					const RxQuery = storeDB.collections.orders
						.find()
						// .find({
						// 	selector: {
						// 		name: { $regex: regexp },
						// 	},
						// })
						.sort({ [q.sortBy]: q.sortDirection });
					return RxQuery.$;
				}),
				catchError((err) => {
					console.error(err);
				})
			),
		[query] as const
	);

	const orders = useObservableState(orders$, []);

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
							const wpCredentials = user.sites[0].wp_credentials[0];
							const baseUrl = 'https://wcposdev.wpengine.com/wp-json/wc/v3/';
							const collection = 'orders';
							const key = wpCredentials.consumer_key;
							const secret = wpCredentials.consumer_secret;
							const api = new WcApiService({ baseUrl, collection, key, secret });
							const data = await api.fetch();
							console.log(data);
							storeDB.collections.orders.bulkInsert(data);
						}}
					/>
				</Segment>
			</Segment.Group>
		</React.Suspense>
	);
};

export default Orders;
