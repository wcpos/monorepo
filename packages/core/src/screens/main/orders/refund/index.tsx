import { useLocalSearchParams } from 'expo-router';

import { useEngineRecord } from '@wcpos/query/record-readers';

import { RefundOrderModal } from './modal';

export function RefundOrderScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const resource = useEngineRecord('orders', orderId);

	return <RefundOrderModal resource={resource} />;
}
