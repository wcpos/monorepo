import { useLocalSearchParams } from 'expo-router';

import { EditOrderModal } from './modal';
import { useEngineDocument } from '../../hooks/use-engine-document';

export function EditOrderScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineDocument<import('@wcpos/database').OrderDocument>('orders', orderId);

	return <EditOrderModal resource={resource} />;
}
