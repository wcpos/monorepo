import * as React from 'react';
import Icon from '@wcpos/common/src/components/icon';
import Tooltip from '@wcpos/common/src/components/tooltip';

type Props = {
	item: import('@wcpos/common/src/database').OrderDocument;
};

const iconMap = {
	pending: 'clock',
	'pos-open': 'cartShopping',
};

const Status = ({ item: order }: Props) => {
	return order.status ? (
		<Tooltip content={order.status}>
			<Icon name={iconMap[order.status]} />
		</Tooltip>
	) : (
		<Icon.Skeleton />
	);
};

export default Status;
