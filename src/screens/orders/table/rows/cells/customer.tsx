import * as React from 'react';
import Text from '../../../../../components/text';

type Props = {
	order: any;
};

const Customer = ({ order }: Props) => {
	return <Text>{order.customer_id}</Text>;
};

export default Customer;
