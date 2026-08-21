import { useLocalSearchParams } from 'expo-router';

import { RefundOrderModal } from './modal';
import { useEngineRecord } from '../../hooks/use-engine-document';

export function RefundOrderScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineRecord('orders', orderId);

	return <RefundOrderModal resource={resource} />;
}
