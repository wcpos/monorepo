import * as React from 'react';

import { useRoute } from '@react-navigation/native';

import Box from '@wcpos/components/src/box';
import Modal from '@wcpos/components/src/modal';

import GatewayTabs from './components/gateway-tabs';
import CheckoutTitle from './components/title';
import { GatewaysProvider } from '../../../../../contexts/gateways';
import { OrdersProvider } from '../../../../../contexts/orders';
import { t } from '../../../../../lib/translations';

const Checkout = () => {
	const route = useRoute();
	const { orderID } = route.params;

	return (
		<OrdersProvider initialQuery={{ filters: { uuid: orderID } }}>
			<GatewaysProvider initialQuery={{ filters: { enabled: true } }}>
				<Box space="medium">
					<CheckoutTitle />
					<GatewayTabs />
				</Box>
			</GatewaysProvider>
		</OrdersProvider>
	);
};

export default Checkout;
