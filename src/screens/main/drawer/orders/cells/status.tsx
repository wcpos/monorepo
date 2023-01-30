import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';

import useOrders from '../../../../../contexts/orders';

type Props = {
	item: import('@wcpos/database').OrderDocument;
};

const iconMap = {
	pending: {
		name: 'clock',
		type: '#ffc107',
	},
	processing: {
		name: 'circleEllipsis',
		type: 'attention',
	},
	'on-hold': {
		name: 'circlePause',
		type: 'info',
	},
	completed: {
		name: 'circleCheck',
		type: 'success',
	},
	cancelled: {
		name: 'circleXmark',
		type: 'warning',
	},
	refunded: {
		name: 'arrowRotateLeft',
		type: 'attention',
	},
	failed: {
		name: 'triangleExclamation',
		type: 'critical',
	},
	'pos-open': {
		name: 'cartShopping',
		type: 'primary',
	},
};

/**
 *
 */
const Status = ({ item: order }: Props) => {
	const status = useObservableState(order.status$, order.status);
	const iconName = get(iconMap, [status, 'name'], 'circleQuestion');
	const iconType = get(iconMap, [status, 'type'], 'disabled');
	const { setQuery } = useOrders();

	/**
	 *
	 */
	const handlePress = React.useCallback(() => {
		setQuery('filters.status', status);
	}, [setQuery, status]);

	/**
	 *
	 */
	return (
		<Icon
			name={iconName}
			type={iconType}
			tooltip={status}
			tooltipPlacement="right"
			onPress={handlePress}
		/>
	);
};

export default Status;
