import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';
import Text from '@wcpos/components/src/text';

import useOrders from '../../contexts/orders';

type Props = {
	item: import('@wcpos/database').OrderDocument;
};

const Customer = ({ item: order }: Props) => {
	const { setQuery } = useOrders();
	// const customerId = useObservableState(order.customer_id$, order.customer_id);
	// const billing = useObservableState(order.billing$, order.billing);

	// const customerName = React.useMemo(() => {
	// 	let name = '';

	// 	if (billing?.first_name || billing?.last_name) {
	// 		name = `${billing?.first_name || ''} ${billing?.last_name || ''}`;
	// 	}

	// 	if (customerId === 0) {
	// 		name = 'Guest';
	// 	}

	// 	if (name.trim() === '') {
	// 		return String(customerId);
	// 	}

	// 	return name;
	// }, [billing?.first_name, billing?.last_name, customerId]);

	return (
		<Pill
			onPress={() => {
				setQuery('selector.customer_id', order.customer_id);
			}}
		>
			{String(order.customer_id)}
		</Pill>
	);
};

export default Customer;
