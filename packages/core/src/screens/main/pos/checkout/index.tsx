import * as React from 'react';

import { Redirect, useLocalSearchParams } from 'expo-router';

import { useEngineRecord } from '@wcpos/query/record-readers';

import { useTheme } from '../../../../contexts/theme';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { enterCheckout } from './checkout-mode';
import { Checkout } from './checkout';

export function CheckoutScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineRecord('orders', orderId);

	const { screenSize } = useTheme();
	const { loaded, unsupportedSchema } = usePaymentMethods();
	const redirectToColumns = screenSize !== 'sm' && loaded && !unsupportedSchema;
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
