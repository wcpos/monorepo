import React, { useState } from 'react';
import useData from '../../hooks/use-data';
import useUI from '../../hooks/use-ui';
import Table from './table';
import Button from '../../components/button';
import { syncOrders } from '../../actions/order';
import { TableLayout } from '../../components/layout';

const Orders = () => {
	// const [search, setSearch] = useState('');
	// const { storeDB } = useDatabase();
	// const orders = useObservable(
	// 	storeDB.collections
	// 		.get('orders')
	// 		.query()
	// 		.observeWithColumns(['number']),
	// 	[]
	// );

	const { data } = useData('orders');

	const orders = data.slice(0, 2);

	orders.forEach(order => {
		if (order && !order.status) {
			order.fetch();
		}
	});

	const { ui }: any = useUI('orders');

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
