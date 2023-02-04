import * as React from 'react';

import Box from '@wcpos/components/src/box';

import GatewayTabs from './components/gateway-tabs';
import CheckoutTitle from './components/title';
import { t } from '../../../../../lib/translations';

const Checkout = () => {
	return (
		<Box space="medium">
			<CheckoutTitle />
			<GatewayTabs />
		</Box>
	);
};

export default Checkout;
