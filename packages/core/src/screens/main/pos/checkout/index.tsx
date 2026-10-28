import * as React from 'react';

import { Redirect, useLocalSearchParams } from 'expo-router';

import { useEngineRecord } from '@wcpos/query/record-readers';
import { useIsPhone } from '@wcpos/components/lib/device';

import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { enterCheckout } from './checkout-mode';
import { Checkout } from './checkout';
import { STANDALONE_CHECKOUT_PARAM } from './till-route';

export function CheckoutScreen() {
	const params = useLocalSearchParams<{
		orderId: string;
		[STANDALONE_CHECKOUT_PARAM]?: string;
	}>();
	const { orderId } = params;
	const resource = useEngineRecord('orders', orderId);

	const phone = useIsPhone();
	const { loaded, unsupportedSchema } = usePaymentMethods();
	// A standalone link names an order that may not be an open cart; the columns cart could
	// not resolve it, so the order's own checkout opens instead.
	const standalone = params[STANDALONE_CHECKOUT_PARAM] === '1';
	const redirectToColumns = !phone && loaded && !unsupportedSchema && !standalone;
	// Writing the external store during render would notify its subscribers mid-render; the
	// transition belongs in an effect, with the redirect itself staying in render.
	React.useEffect(() => {
		if (redirectToColumns) enterCheckout(orderId);
	}, [redirectToColumns, orderId]);
	if (redirectToColumns) {
		return (
			<Redirect
				href={{
					pathname: '/(app)/(drawer)/(pos)/(columns)/cart/[...orderId]',
					params: { orderId: [orderId, 'checkout'] },
				}}
			/>
		);
	}
	return <Checkout resource={resource} />;
}
