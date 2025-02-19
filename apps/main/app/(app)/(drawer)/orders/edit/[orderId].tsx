import React from 'react';

import { useLocalSearchParams } from 'expo-router';
import { ObservableResource } from 'observable-hooks';

import { useCollection } from '@wcpos/core/screens/main/hooks/use-collection';
import { EditOrder } from '@wcpos/core/screens/main/orders/edit-order';

export default function EditOrderScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const { collection } = useCollection('orders');
	const query = collection.findOneFix(orderId);

	const resource = React.useMemo(() => new ObservableResource(query.$), [query]);

	return <EditOrder resource={resource} />;
}
