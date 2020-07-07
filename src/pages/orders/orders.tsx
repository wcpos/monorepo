import React from 'react';
import { View, Text } from 'react-native';
import { useObservableSuspense } from 'observable-hooks';
import Segment from '../../components/segment';
import Table from './table';
import Actions from './actions';
import useAppState from '../../hooks/use-app-state';

interface Props {}

const Orders: React.FC<Props> = () => {
	const [{ store }] = useAppState();
	const ui = useObservableSuspense(store.uiResources.orders);
	const orders = useObservableSuspense(store.getDataResource('orders'));

	const onResetUI = () => {
		ui.reset();
	};

	const onSort = ({ sortBy, sortDirection }) => {
		console.log({ sortBy, sortDirection });
		// ui.updateWithJson({ sortBy, sortDirection });
	};

	return (
		<React.Suspense fallback={<Text>loading orders...</Text>}>
			<Segment.Group>
				<Segment>
					<Actions ui={ui} />
				</Segment>
				<Segment grow>
					<Table
						orders={orders}
						columns={ui.columns}
						sort={onSort}
						sortBy={ui.sortBy}
						sortDirection={ui.sortDirection}
					/>
				</Segment>
				<Segment>
					<Text>Footer</Text>
				</Segment>
			</Segment.Group>
		</React.Suspense>
	);
};

export default Orders;
