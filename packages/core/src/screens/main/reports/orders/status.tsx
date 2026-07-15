import * as React from 'react';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import type { OrderCollection, OrderDocument } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { useOrderStatusLabel } from '../../hooks/use-order-status-label';

import type { CellContext } from '@tanstack/react-table';

const iconMap = {
	pending: { name: 'clock', type: 'info' },
	processing: { name: 'circleEllipsis', type: 'info' },
	'on-hold': { name: 'circlePause', type: 'info' },
	completed: { name: 'circleCheck', type: 'success' },
	cancelled: { name: 'circleXmark', type: 'warning' },
	refunded: { name: 'arrowRotateLeft', type: 'warning' },
	failed: { name: 'triangleExclamation', type: 'error' },
	'pos-open': { name: 'cartShopping', type: 'primary' },
	'pos-partial': { name: 'circleDollar', type: 'info' },
};

/**
 * Legacy reports cell. Delete when reports/orders migrates to query-state bindings.
 */
export function Status({ table, row }: CellContext<{ document: OrderDocument }, 'status'>) {
	const order = row.original.document;
	const status = useObservableEagerState(order.status$!);
	const iconName = get(iconMap, [status ?? '', 'name'], 'circleQuestion') as string;
	const iconType = get(iconMap, [status ?? '', 'type'], 'disabled') as string;
	const query = (table.options.meta as { query?: Query<OrderCollection> } | undefined)?.query;
	const { getLabel } = useOrderStatusLabel();

	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>
				<IconButton
					name={iconName as import('@wcpos/components/icon').IconName}
					variant={iconType as 'muted'}
					onPress={() => query?.where('status').equals(status).exec()}
				/>
			</TooltipTrigger>
			<TooltipContent side="right">
				<Text>{getLabel(status ?? '')}</Text>
			</TooltipContent>
		</Tooltip>
	);
}
