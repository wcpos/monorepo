import { useLocalSearchParams } from 'expo-router';

import { Checkout } from './checkout';
import { useEngineRecord } from '../../hooks/use-engine-document';

export function CheckoutScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineRecord('orders', orderId);

	return <Checkout resource={resource} />;
}
