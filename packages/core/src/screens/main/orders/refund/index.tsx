import { useLocalSearchParams } from 'expo-router';

import { RefundOrderModal } from './modal';
import { useEngineDocument } from '../../hooks/use-engine-document';

export function RefundOrderScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineDocument<import('@wcpos/database').OrderDocument>('orders', orderId);

	return <RefundOrderModal resource={resource} />;
}
