import React from 'react';

import { useLocalSearchParams } from 'expo-router';
import { ObservableResource } from 'observable-hooks';

import { Receipt } from './receipt';
import { useCollection } from '../hooks/use-collection';

export const ReceiptScreen = () => {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const { collection } = useCollection('orders');
	const query = collection.findOneFix(orderId);

	const resource = React.useMemo(() => new ObservableResource(query.$), [query]);

	return <Receipt resource={resource} />;
};
