import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import get from 'lodash/get';
import Icon from '@wcpos/components/src/icon';

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

const Status = ({ item: order }: Props) => {
	const status = useObservableState(order.status$, order.status);
	const iconName = get(iconMap, [status, 'name'], 'circleQuestion');
	const iconType = get(iconMap, [status, 'type'], 'disabled');

	return status ? (
		<Icon name={iconName} type={iconType} tooltip={status} tooltipPlacement="right" />
	) : (
		<Icon.Skeleton />
	);
};

export default Status;
