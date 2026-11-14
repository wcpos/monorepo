import * as React from 'react';

import { StatusBadge, type StatusBadgeProps } from '@wcpos/components/status-badge';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { StatusFilterCell } from '../../components/status-filter-cell';
import { useOrderStatusLabel } from '../../hooks/use-order-status-label';

const variants: Record<string, StatusBadgeProps['variant']> = {
	completed: 'ok',
	processing: 'info',
	'pos-open': 'info',
	'on-hold': 'warning',
	pending: 'warning',
	'pos-partial': 'warning',
	failed: 'bad',
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
	const { items } = useOrderStatusLabel();
	return (
		<StatusFilterCell
			table={table}
			field="status"
			value={status}
			options={items}
			tones={variants}
			testID={`order-status-${row.original.record.uuid}`}
		/>
	);
}
