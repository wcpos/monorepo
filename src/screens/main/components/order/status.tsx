import * as React from 'react';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { useDataTable } from '@wcpos/tailwind/src/data-table';
import { IconButton } from '@wcpos/tailwind/src/icon-button';
import { Text } from '@wcpos/tailwind/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/tailwind/src/tooltip';

import { useOrderStatusLabel } from '../../hooks/use-order-status-label';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

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
	'pos-partial': {
		name: 'circleDollar',
		type: 'primary',
	},
};

/**
 *
 */
export const Status = ({ row }: CellContext<OrderDocument, 'status'>) => {
	const order = row.original;
	const status = useObservableEagerState(order.status$);
	const iconName = get(iconMap, [status, 'name'], 'circleQuestion');
	const iconType = get(iconMap, [status, 'type'], 'disabled');
	const { query } = useDataTable();
	const { getLabel } = useOrderStatusLabel();

	/**
	 *
	 */
	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>
				<IconButton
					name={iconName}
					variant={iconType}
					onPress={() => query.where('status', status)}
				/>
			</TooltipTrigger>
			<TooltipContent side="right">
				<Text>{getLabel(status)}</Text>
			</TooltipContent>
		</Tooltip>
	);
};
