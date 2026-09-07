import { Redirect, useLocalSearchParams } from 'expo-router';

import { useTheme } from '../../../../contexts/theme';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { enterCheckout } from './checkout-mode';
import { Checkout } from './checkout';
import { useEngineRecord } from '../../hooks/use-engine-document';

export function CheckoutScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineRecord('orders', orderId);

	const { screenSize } = useTheme();
	const { loaded, unsupportedSchema } = usePaymentMethods();
	if (screenSize !== 'sm' && loaded && !unsupportedSchema) {
		enterCheckout(orderId);
		return (
			<Redirect
				href={{
					pathname: '/(app)/(drawer)/(pos)/(columns)/cart/[...orderId]',
					params: { orderId: [orderId] },
				}}
			/>
		);
	}
	return <Checkout resource={resource} />;
}
