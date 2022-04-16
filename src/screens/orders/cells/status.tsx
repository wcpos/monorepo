import * as React from 'react';
import Icon from '@wcpos/components/src/icon';

type Props = {
	item: import('@wcpos/database').OrderDocument;
};

const iconMap = {
	pending: 'clock',
	'pos-open': 'cartShopping',
};

const Status = ({ item: order }: Props) => {
	return order.status ? (
		<Icon name={iconMap[order.status]} tooltip={order.status} />
	) : (
		<Icon.Skeleton />
	);
};

export default Status;
