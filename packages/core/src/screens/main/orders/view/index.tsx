import React from 'react';

import { useLocalSearchParams } from 'expo-router';
import { ObservableResource } from 'observable-hooks';

import { ViewOrderModal } from './modal';
import { useCollection } from '../../hooks/use-collection';

type OrderDocument = import('@wcpos/database').OrderDocument;

export function ViewOrderScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const { collection } = useCollection('orders');

	const resource = React.useMemo(
		() =>
			new ObservableResource(collection.findOneFix(orderId).$) as ObservableResource<OrderDocument>,
		[collection, orderId]
	);

	return <ViewOrderModal resource={resource} />;
}
