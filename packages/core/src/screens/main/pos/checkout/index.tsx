import { useLocalSearchParams } from 'expo-router';

import { Checkout } from './checkout';
import { useEngineDocument } from '../../hooks/use-engine-document';

export function CheckoutScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineDocument<import('@wcpos/database').OrderDocument>('orders', orderId);

	return <Checkout resource={resource} />;
}
