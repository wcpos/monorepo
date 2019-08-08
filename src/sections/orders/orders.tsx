import React, { useState } from 'react';
import useDatabase from '../../hooks/use-database';
import useObservable from '../../hooks/use-observable';
import useUI from '../../hooks/use-ui';
import Table from './table';
import Button from '../../components/button';
import Segment, { SegmentGroup } from '../../components/segment';
import { syncOrders } from '../../actions/order';

const Orders = () => {
	// const [search, setSearch] = useState('');
	const database = useDatabase();
	const orders = useObservable(
		database.collections
			.get('orders')
			.query()
			.observeWithColumns(['number']),
		[]
	);

	const ui: any = useUI('orders');

	return (
		ui && (
			<SegmentGroup>
				<Segment>
					<Button title="Sync" onPress={syncOrders} />
				</Segment>
				<Segment>
					<Table orders={orders} columns={ui.columns} />
				</Segment>
				<Segment content={orders && orders.length} />
			</SegmentGroup>
		)
	);
};

export default Orders;
