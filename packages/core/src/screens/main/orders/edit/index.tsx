import { useLocalSearchParams } from 'expo-router';

import { EditOrderModal } from './modal';
import { useEngineRecord } from '../../hooks/use-engine-document';

export function EditOrderScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineRecord('orders', orderId);

	return <EditOrderModal resource={resource} />;
}
