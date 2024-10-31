import * as React from 'react';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { useDataTable } from '@wcpos/components/src/data-table';
import { IconButton } from '@wcpos/components/src/icon-button';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/src/tooltip';

import { useOrderStatusLabel } from '../../hooks/use-order-status-label';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

const iconMap = {
	pending: {
		name: 'clock',
		type: 'info',
	},
	processing: {
		name: 'circleEllipsis',
		type: 'info',
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
		type: 'warning',
	},
	failed: {
		name: 'triangleExclamation',
		type: 'error',
	},
	'pos-open': {
		name: 'cartShopping',
		type: 'primary',
	},
	'pos-partial': {
		name: 'circleDollar',
		type: 'info',
	},
};

/**
 *
 */
export const Status = ({ row }: CellContext<{ document: OrderDocument }, 'status'>) => {
	const order = row.original.document;
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
					onPress={() => query.where('status').equals(status).exec()}
				/>
			</TooltipTrigger>
			<TooltipContent side="right">
				<Text>{getLabel(status)}</Text>
			</TooltipContent>
		</Tooltip>
	);
};
