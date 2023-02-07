import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import { useModal } from '@wcpos/components/src/modal';

import GatewayTabs from './components/gateway-tabs';
import CheckoutTitle from './components/title';
import { t } from '../../../../lib/translations';
import useOrders from '../../contexts/orders';

/**
 *
 */
const Checkout = () => {
	const { data: order } = useOrders();
	const number = useObservableState(order.number$, order.number);
	const { setTitle } = useModal();

	if (!order) {
		throw new Error('Order not found');
	}

	React.useEffect(() => {
		setTitle(() => t('Checkout Order #{number}', { _tags: 'core', number }));
	}, [number, setTitle]);

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
