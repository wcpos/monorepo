import { useLocalSearchParams } from 'expo-router';

import { useEngineRecord } from '@wcpos/query/record-readers';

import { Receipt } from './receipt';
import { usePanelSide } from '../pos/contexts/overlay-side';

export function ReceiptScreen({ side = 'right' }: { side?: 'left' | 'right' }) {
	const { orderId, document } = useLocalSearchParams<{ orderId: string; document?: string }>();
	const refundDocument =
		typeof document === 'string' && /^refund:\d+$/.test(document) ? document : undefined;
	const resource = useEngineRecord('orders', orderId);

	return <Receipt resource={resource} document={refundDocument} side={side} />;
}

export function POSReceiptScreen() {
	const side = usePanelSide('cart');
	return <ReceiptScreen side={side} />;
}
