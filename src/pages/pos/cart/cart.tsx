import React from 'react';
import { useObservableSuspense, useObservableState } from 'observable-hooks';
import useAppState from '../../../hooks/use-app-state';
import Segment from '../../../components/segment';
import Text from '../../../components/text';
import Table from './table';
import CustomerSelect from './customer-select';

interface Props {}

const Cart: React.FC<Props> = ({ ui }) => {
	const [{ store }] = useAppState();

	const orders = useObservableSuspense(store.getDataResource('orders'));
	const order = orders[0];

	return (
		<Segment.Group>
			<Segment>
				<CustomerSelect ui={ui} />
			</Segment>
			<Segment grow>
				<Table order={order} columns={ui.columns} />
			</Segment>
			<Segment>
				<Text>
					Subtotal:
					{order.subtotal}
				</Text>
				<Text>
					Total Tax:
					{order.total_tax}
				</Text>
				<Text>
					Order Total:
					{order.total}
				</Text>
			</Segment>
		</Segment.Group>
	);
};

export default Cart;
