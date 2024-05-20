import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';
import Text from '@wcpos/components/src/text';
import { useQueryManager } from '@wcpos/query';

import useCustomerNameFormat from '../../hooks/use-customer-name-format';

type Props = {
	item: import('@wcpos/database').OrderDocument;
};

const Customer = ({ item: order }: Props) => {
	const manager = useQueryManager();
	const query = manager.getQuery(['orders']);
	const { format } = useCustomerNameFormat();
	const customerID = useObservableEagerState(order.customer_id$);
	const billing = useObservableEagerState(order.billing$);
	const shipping = useObservableEagerState(order.shipping$);

	return (
		<Pill onPress={() => query.where('customer_id', customerID)}>
			{format({ billing, shipping, id: customerID })}
		</Pill>
	);
};

export default Customer;
