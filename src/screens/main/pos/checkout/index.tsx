import * as React from 'react';

import Box from '@wcpos/components/src/box';
import { useModal } from '@wcpos/components/src/modal';

import GatewayTabs from './components/gateway-tabs';
import CheckoutTitle from './components/title';
import useOrders from '../../contexts/orders';

/**
 *
 */
const Checkout = () => {
	const { data: order } = useOrders();
	const { setTitle } = useModal();

	if (!order) {
		throw new Error('Order not found');
	}

	React.useEffect(() => {
		setTitle((prev) => prev + ' Order #' + order.id);
	}, [order.id, setTitle]);

	/**
	 *
	 */
	return (
		<Box space="small">
			<CheckoutTitle order={order} />
			<GatewayTabs order={order} />
		</Box>
	);
};

export default Checkout;
