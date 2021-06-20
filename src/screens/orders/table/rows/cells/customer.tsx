import * as React from 'react';
import Text from '@wcpos/common/src/components/text';

type Props = {
	order: import('@wcpos/common/src/database').OrderDocument;
};

const Customer = ({ order }: Props) => {
	return order.customer_id ? <Text>{order.customer_id}</Text> : <Text.Skeleton />;
};

export default Customer;
