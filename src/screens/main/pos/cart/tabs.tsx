import * as React from 'react';

import { Button } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';
import { Icon } from '@wcpos/components/src/icon';

import { CartTabTitle } from './tab-title';
import { useCurrentOrder } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const OpenOrderTabs = () => {
	const { currentOrder, openOrders, setCurrentOrderID } = useCurrentOrder();
	const orders = openOrders.map((res) => res.document);

	/**
	 *
	 */
	return (
		<HStack>
			{orders.map((order) => (
				<Button
					key="order.uuid"
					variant={order.uuid === currentOrder.uuid ? 'default' : 'secondary'}
					onPress={() => {
						setCurrentOrderID(order.uuid);
					}}
					disabled={order.uuid === currentOrder.uuid}
				>
					<CartTabTitle order={order} />
				</Button>
			))}
			<Button variant={currentOrder.isNew ? 'default' : 'secondary'}>
				<Icon name="plus" />
			</Button>
		</HStack>
	);
};
