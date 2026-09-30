import * as React from 'react';
import { Pressable } from 'react-native';

import { StatusBadge, type StatusBadgeProps } from '@wcpos/components/status-badge';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useOrderStatusLabel } from '../../../hooks/use-order-status-label';

import type { QueryStateActions } from '../../../../../query';

const variants: Record<string, StatusBadgeProps['variant']> = {
	completed: 'success',
	processing: 'info',
	'pos-open': 'info',
	'on-hold': 'warning',
	pending: 'warning',
	'pos-partial': 'warning',
	failed: 'error',
	cancelled: 'muted',
	refunded: 'muted',
	trash: 'muted',
};

export function OrderStatusBadge({ status }: { status?: string }) {
	const { getLabel } = useOrderStatusLabel();
	return (
		<StatusBadge label={getLabel(status ?? '')} variant={variants[status ?? ''] ?? 'default'} />
	);
}

export function Status({ table, row }: CellContext<{ record: EngineRecord<'orders'> }, 'status'>) {
	const status = useRecordField(row.original.record, ({ payload }) => payload.status);
	const actions = (
		table.options.meta as { actions?: Pick<QueryStateActions<'orders'>, 'setFilter'> }
	)?.actions;
	return (
		<Pressable
			testID={`order-status-${row.original.record.uuid}`}
			accessibilityRole="button"
			className="min-h-ctl active:bg-muted justify-center"
			onPress={() => status && actions?.setFilter('status', status)}
		>
			<OrderStatusBadge status={status} />
		</Pressable>
	);
}
