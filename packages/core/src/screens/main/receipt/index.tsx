import { useLocalSearchParams } from 'expo-router';

import { useEngineRecord } from '@wcpos/query/record-readers';

import { Receipt } from './receipt';

export function ReceiptScreen() {
	const { orderId, document } = useLocalSearchParams<{ orderId: string; document?: string }>();
	const refundDocument =
		typeof document === 'string' && /^refund:\d+$/.test(document) ? document : undefined;
	const resource = useEngineRecord('orders', orderId);

	return <Receipt resource={resource} document={refundDocument} />;
}
