import * as React from 'react';

import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { DatePickerInput } from '../../components/coupon/date-picker-input';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

export function EditableDate({
	row,
	table,
}: CellContext<{ record: EngineRecord<'coupons'> }, string>) {
	const item = row.original.record;
	const dateExpiresGmt =
		useRecordField(row.original.record, ({ payload }) => payload.date_expires_gmt) ?? null;
	const commit = table.options.meta?.commit;
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();

	return (
		<CapabilityTooltip show={!readOnly && !caps.canEditCoupons} hint="editCoupons">
			<DatePickerInput
				value={dateExpiresGmt}
				onChange={(val) => commit?.({ document: item, changes: { date_expires_gmt: val } })}
				disabled={readOnly || !caps.canEditCoupons}
			/>
		</CapabilityTooltip>
	);
}
