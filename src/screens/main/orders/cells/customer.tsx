import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';
import Text from '@wcpos/components/src/text';

import { useOrders } from '../../contexts/orders';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

type Props = {
	item: import('@wcpos/database').OrderDocument;
};

const Customer = ({ item: order }: Props) => {
	const { query } = useOrders();
	const { format } = useCustomerNameFormat();
	const customerID = useObservableState(order.customer_id$, order.customer_id);
	const billing = useObservableState(order.billing$, order.billing);
	const shipping = useObservableState(order.shipping$, order.shipping);

	return (
		<Pill onPress={() => query.where('customer_id', customerID)}>
			{format({ billing, shipping, id: customerID })}
		</Pill>
	);
};

export default Customer;
