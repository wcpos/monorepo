import { useLocalSearchParams } from 'expo-router';

import { useEngineRecord } from '@wcpos/query/record-readers';

import { OrderModal } from './modal';

export function OrderScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineRecord('orders', orderId);

	return <OrderModal resource={resource} />;
}
