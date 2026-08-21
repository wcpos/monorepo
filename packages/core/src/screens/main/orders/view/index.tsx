import { useLocalSearchParams } from 'expo-router';

import { ViewOrderModal } from './modal';
import { useEngineRecord } from '../../hooks/use-engine-document';

export function ViewOrderScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineRecord('orders', orderId);

	return <ViewOrderModal resource={resource} />;
}
