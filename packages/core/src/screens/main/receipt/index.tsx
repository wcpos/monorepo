import { useLocalSearchParams } from 'expo-router';

import { Receipt } from './receipt';
import { useEngineRecord } from '../hooks/use-engine-document';

export function ReceiptScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineRecord('orders', orderId);

	return <Receipt resource={resource} />;
}
