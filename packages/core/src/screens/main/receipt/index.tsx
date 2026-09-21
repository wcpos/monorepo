import { useLocalSearchParams } from 'expo-router';

import { Receipt } from './receipt';
import { useEngineRecord } from '../hooks/use-engine-document';

export function ReceiptScreen() {
	const { orderId, document } = useLocalSearchParams<{ orderId: string; document?: string }>();
	const refundDocument =
		typeof document === 'string' && /^refund:\d+$/.test(document) ? document : undefined;
	const resource = useEngineRecord('orders', orderId);

	return <Receipt resource={resource} document={refundDocument} />;
}
