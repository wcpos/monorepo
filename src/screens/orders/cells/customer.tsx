import * as React from 'react';
import Text from '@wcpos/common/src/components/text';

type Props = {
	item: import('@wcpos/common/src/database').OrderDocument;
};

const Customer = ({ item: order }: Props) => {
	return order.customer_id ? <Text>{order.customer_id}</Text> : <Text.Skeleton />;
};

export default Customer;
