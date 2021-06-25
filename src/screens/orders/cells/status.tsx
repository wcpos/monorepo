import * as React from 'react';
import Icon from '@wcpos/common/src/components/icon';
import Tooltip from '@wcpos/common/src/components/tooltip';

type Props = {
	item: import('@wcpos/common/src/database').OrderDocument;
};

const Status = ({ item: order }: Props) => {
	return order.status ? (
		<Tooltip content={order.status}>
			<Icon name={order.status} />
		</Tooltip>
	) : (
		<Icon.Skeleton />
	);
};

export default Status;
