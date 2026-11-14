import * as React from 'react';

import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';
import { StatusFilterCell } from '../../components/status-filter-cell';

const tones = { publish: 'ok', draft: 'muted', pending: 'warning' } as const;

export function Status({ row, table }: CellContext<{ record: EngineRecord<'coupons'> }, 'status'>) {
	const status = useRecordField(row.original.record, ({ payload }) => payload.status) ?? '';
	const t = useT();
	const options = [
		{ value: 'publish', label: t('coupons.publish') },
		{ value: 'draft', label: t('coupons.draft') },
		{ value: 'pending', label: t('coupons.pending') },
	];
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
