import * as React from 'react';
import { View, Text } from 'react-native';
import { useObservableState, useObservable } from 'observable-hooks';
import { switchMap, tap, debounceTime, catchError, distinctUntilChanged } from 'rxjs/operators';
import Segment from '../../components/segment';
import Table from './table';
import Actions from './actions';
import useAppState from '../../hooks/use-app-state';
import Button from '../../components/button';
import WcApiService from '../../services/wc-api';

type Sort = import('../../components/table/types').Sort;

const Customers = () => {
	const [{ user, storeDB, storePath }] = useAppState();
	const ui = storeDB.getUI('customers');

	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));

	const onSort: Sort = ({ sortBy, sortDirection }) => {
		console.log({ sortBy, sortDirection });
		// ui.updateWithJson({ sortBy, sortDirection });
	};

	const [query, setQuery] = React.useState({
		search: '',
		sortBy: 'first_name',
		sortDirection: 'asc',
	});

	const customers$ = useObservable(
		// A stream of React elements!
		(inputs$) =>
			inputs$.pipe(
				distinctUntilChanged((a, b) => a[0] === b[0]),
				debounceTime(150),
				switchMap(([q]) => {
					const regexp = new RegExp(escape(q.search), 'i');
					const RxQuery = storeDB.collections.customers
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
					return err;
				})
			),
		[query] as const
	);

	const customers = useObservableState(customers$, []);

	return (
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
						title="Fetch customers"
						onPress={async () => {
							const path = storePath.split('.');
							const site = user.get(path.slice(1, 3).join('.'));
							const wpCredentials = user.get(path.slice(1, 5).join('.'));
							const baseUrl = site.wc_api_url;
							const collection = 'customers';
							const key = wpCredentials.consumer_key;
							const secret = wpCredentials.consumer_secret;
							const api = new WcApiService({ baseUrl, collection, key, secret });
							const data = await api.fetch();
							console.log(data);
							storeDB.collections.customers.bulkInsert(data);
						}}
					/>
				</Segment>
			</Segment.Group>
		</React.Suspense>
	);
};

export default Customers;
