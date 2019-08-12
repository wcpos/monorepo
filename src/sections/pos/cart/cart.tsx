import React, { useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import useDatabase from '../../../hooks/use-database';
import useObservable from '../../../hooks/use-observable';
import Button from '../../../components/button';
import Segment, { SegmentGroup } from '../../../components/segment';
import Customer from './customer';
import Table from './table';
import Totals from './totals';
import Note from './note';
import Tabs from './tabs';

const Cart = () => {
	const database = useDatabase();
	const orders = useObservable(
		database.collections
			.get('orders')
			.query(Q.where('status', 'completed'))
			.observeWithColumns(['line_items']),
		[]
	);
	const [activeOrder, setActiveOrder] = useState(false);
	const [showCustomerNote, setShowCustomerNote] = useState(false);

	const handleUpdate = (json: any) => {
		// @ts-ignore
		activeOrder.updateFromJSON(json);
	};

	if (!activeOrder) {
		return (
			<SegmentGroup>
				<Segment>
					<Customer />
				</Segment>
				<Segment content="Your cart is currently empty." />
				<Segment>
					<Tabs orders={orders} setActiveOrder={setActiveOrder} />
				</Segment>
			</SegmentGroup>
		);
	}

	return (
		<SegmentGroup style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
			<Segment style={{ flex: -1 }}>
				<Customer order={activeOrder} />
			</Segment>
			<Segment style={{ flex: 1, padding: 0 }}>
				<Table
					// @ts-ignore
					line_items={activeOrder.line_items}
					// order={activeOrder}
				/>
			</Segment>
			<Segment style={{ flex: -1 }}>
				<Totals order={activeOrder} />
			</Segment>
			<Segment style={{ flex: -1 }}>
				<Button title="Note" onPress={() => setShowCustomerNote(true)} />
			</Segment>

			<Segment style={{ flex: -1 }}>
				<Note
					// @ts-ignore
					customer_note={activeOrder.customer_note}
					onUpdate={handleUpdate}
				/>
			</Segment>

			<Segment style={{ flex: -1 }}>
				<Tabs orders={orders} setActiveOrder={setActiveOrder} />
			</Segment>
		</SegmentGroup>
	);
};

export default Cart;
