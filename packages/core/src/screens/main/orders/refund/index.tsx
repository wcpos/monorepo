import React from 'react';

import { useLocalSearchParams } from 'expo-router';
import { ObservableResource } from 'observable-hooks';

import { RefundOrderModal } from './modal';
import { useCollection } from '../../hooks/use-collection';

export function RefundOrderScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const { collection } = useCollection('orders');
	const query = collection.findOneFix(orderId);

	const resource = React.useMemo(() => new ObservableResource(query.$), [query]);

	return (
		<RefundOrderModal
			resource={resource as ObservableResource<import('@wcpos/database').OrderDocument>}
		/>
	);
}
