import { useLocalSearchParams } from 'expo-router';

import { ViewOrderModal } from './modal';
import { useEngineDocument } from '../../hooks/use-engine-document';

type OrderDocument = import('@wcpos/database').OrderDocument;

export function ViewOrderScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineDocument<OrderDocument>('orders', orderId);

	return <ViewOrderModal resource={resource} />;
}
