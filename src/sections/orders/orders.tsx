import React, { useState } from 'react';
import useDatabase from '../../hooks/use-database';
import useObservable from '../../hooks/use-observable';
import useUI from '../../hooks/use-ui';
import Table from './table';
import Button from '../../components/button';
import { syncOrders } from '../../actions/order';
import { TableLayout } from '../../components/layout';

const Orders = () => {
	// const [search, setSearch] = useState('');
	const { storeDB } = useDatabase();
	const orders = useObservable(
		storeDB.collections
			.get('orders')
			.query()
			.observeWithColumns(['number']),
		[]
	);

	const ui: any = useUI('orders');

	return (
		ui && (
			<TableLayout
				actions={<Button title="Sync" onPress={syncOrders} />}
				table={<Table orders={orders} columns={ui.columns} />}
				footer={orders && orders.length}
			/>
		)
	);
};

export default Orders;
