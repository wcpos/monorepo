import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import { useModal } from '@wcpos/components/src/modal';

import GatewayTabs from './components/gateway-tabs';
import PaymentWebview from './components/payment-webview';
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
		let title = t('Checkout', { _tags: 'core' });
		if (number) {
			title = t('Checkout Order #{number}', {
				_tags: 'core',
				number,
				_context: 'Checkout Order title',
			});
		}
		setTitle(() => title);
	}, [number, setTitle]);

	/**
	 *
	 */
	return (
		<Box fill space="small">
			<CheckoutTitle order={order} />
			<PaymentWebview order={order} />
		</Box>
	);
};

export default Checkout;
