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
	const { data } = useOrders();
	const order = data.length === 1 && data[0];

	if (!order) {
		throw new Error(t('Order not found', { _tags: 'core' }));
	}

	const number = useObservableState(order.number$, order.number);
	const { setTitle } = useModal();

	React.useEffect(() => {
		setTitle(() =>
			t('Checkout Order #{number}', { _tags: 'core', number, _context: 'Checkout Order title' })
		);
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
