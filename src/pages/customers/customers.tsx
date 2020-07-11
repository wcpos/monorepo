import React from 'react';
import { View, Text } from 'react-native';
import { useObservableSuspense } from 'observable-hooks';
import Segment from '../../components/segment';
import Table from './table';
import Actions from './actions';
import useAppState from '../../hooks/use-app-state';
import Button from '../../components/button';
import WcApiService from '../../services/wc-api';

interface Props {}

const Customers: React.FC<Props> = () => {
	const [{ appUser, store }] = useAppState();
	const ui = useObservableSuspense(store.uiResources.customers);
	const customers = useObservableSuspense(store.getDataResource('customers'));
	const storeDatabase = useObservableSuspense(store.dbResource);

	const onResetUI = () => {
		ui.reset();
	};

	const onSort = ({ sortBy, sortDirection }) => {
		console.log({ sortBy, sortDirection });
		// ui.updateWithJson({ sortBy, sortDirection });
	};

	return (
		<React.Suspense fallback={<Text>loading customers...</Text>}>
			<Segment.Group>
				<Segment>
					<Actions ui={ui} />
				</Segment>
				<Segment grow>
					<Table
						customers={customers}
						columns={ui.columns}
						sort={onSort}
						sortBy={ui.sortBy}
						sortDirection={ui.sortDirection}
					/>
				</Segment>
				<Segment>
					<Button
						title="Fetch customers"
						onPress={async () => {
							const wpUser = await appUser.collections().wp_users.findOne().exec();
							const baseUrl = 'https://wcposdev.wpengine.com/wp-json/wc/v3/';
							const collection = 'customers';
							const key = wpUser.consumer_key;
							const secret = wpUser.consumer_secret;
							const api = new WcApiService({ baseUrl, collection, key, secret });
							const data = await api.fetch();
							console.log(data);
							storeDatabase.collections.customers.bulkInsert(data);
						}}
					/>
				</Segment>
			</Segment.Group>
		</React.Suspense>
	);
};

export default Customers;
