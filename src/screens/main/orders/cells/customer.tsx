import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';
import Text from '@wcpos/components/src/text';

import useOrders from '../../contexts/orders';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

type Props = {
	item: import('@wcpos/database').OrderDocument;
};

const Customer = ({ item: order }: Props) => {
	const { setQuery } = useOrders();
	const { format } = useCustomerNameFormat();

	return (
		<Pill
			onPress={() => {
				setQuery('selector.customer_id', order.customer_id);
			}}
		>
			{format({ billing: order.billing, shipping: order.shipping, id: order.customer_id })}
		</Pill>
	);
};

export default Customer;
