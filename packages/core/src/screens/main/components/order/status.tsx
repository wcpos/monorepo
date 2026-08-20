import * as React from 'react';

import get from 'lodash/get';

import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useOrderStatusLabel } from '../../hooks/use-order-status-label';

import type { QueryStateActions } from '../../../../query';

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
export function Status({
	table,
	row,
}: CellContext<{ document: OrderDocument; record: EngineRecord<'orders'> }, 'status'>) {
	const status = useRecordField(row.original.record, ({ payload }) => payload.status);
	const iconName = get(iconMap, [status ?? '', 'name'], 'circleQuestion') as string;
	const iconType = get(iconMap, [status ?? '', 'type'], 'disabled') as string;
	const actions = (
		table.options.meta as {
			actions?: Pick<QueryStateActions<'orders'>, 'setFilter'>;
		}
	)?.actions;
	const { getLabel } = useOrderStatusLabel();

	/**
	 *
	 */
	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>
				<IconButton
					name={iconName as import('@wcpos/components/icon').IconName}
					variant={iconType as 'muted'}
					onPress={() => status && actions?.setFilter('status', status)}
				/>
			</TooltipTrigger>
			<TooltipContent side="right">
				<Text>{getLabel(status ?? '')}</Text>
			</TooltipContent>
		</Tooltip>
	);
}
