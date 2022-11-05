import * as React from 'react';
import Text from '@wcpos/components/src/text';
import useOrders from '@wcpos/core/src/contexts/orders';

export const Receipt = () => {
	const { data } = useOrders();
	const order = data?.[0]; // @TODO - findOne option

	return <Text>{JSON.stringify(order)}</Text>;
};
