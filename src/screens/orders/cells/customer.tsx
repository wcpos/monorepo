import * as React from 'react';
import Text from '@wcpos/components/src/text';

type Props = {
	item: import('@wcpos/database').OrderDocument;
};

const Customer = ({ item: order }: Props) => {
	return order.customer_id ? <Text>{order.customer_id}</Text> : <Text.Skeleton />;
};

export default Customer;
