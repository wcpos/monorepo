import React from 'react';

import { useLocalSearchParams } from 'expo-router';
import { ObservableResource } from 'observable-hooks';

import { Checkout } from './checkout';
import { useCollection } from '../../hooks/use-collection';

export const CheckoutScreen = () => {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	const { collection } = useCollection('orders');
	const query = collection.findOneFix(orderId);

	const resource = React.useMemo(
		() =>
			new ObservableResource(query.$) as ObservableResource<
				import('@wcpos/database').OrderDocument
			>,
		[query]
	);

	return <Checkout resource={resource} />;
};
