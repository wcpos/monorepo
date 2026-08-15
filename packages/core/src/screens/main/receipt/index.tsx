import { useLocalSearchParams } from 'expo-router';

import { Receipt } from './receipt';
import { useEngineDocument } from '../hooks/use-engine-document';

type OrderDocument = import('@wcpos/database').OrderDocument;

export function ReceiptScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineDocument<OrderDocument>('orders', orderId);

	return <Receipt resource={resource} />;
}
