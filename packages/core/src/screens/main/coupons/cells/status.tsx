import * as React from 'react';

import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';
import { StatusFilterCell } from '../../components/status-filter-cell';

const labelMap: Record<string, string> = {
	publish: 'coupons.publish',
	draft: 'coupons.draft',
	pending: 'coupons.pending',
};
const tones = { publish: 'success', draft: 'muted', pending: 'warning' } as const;

export function Status({ row, table }: CellContext<{ record: EngineRecord<'coupons'> }, 'status'>) {
	const status = useRecordField(row.original.record, ({ payload }) => payload.status) ?? '';
	const t = useT();
	const options = Object.entries(labelMap).map(([value, key]) => ({ value, label: t(key) }));
	return (
		<StatusFilterCell
			table={table}
			field="status"
			value={status}
			options={options}
			tones={tones}
			testID={`coupon-status-${row.original.record.uuid}`}
		/>
	);
}
