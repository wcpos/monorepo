import * as React from 'react';

import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { DatePickerInput } from '../../components/coupon/date-picker-input';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

type CouponDocument = import('@wcpos/database').CouponDocument;

export function EditableDate({
	row,
	table,
}: CellContext<{ document: CouponDocument; record: EngineRecord<'coupons'> }, string>) {
	const item = row.original.document;
	const dateExpiresGmt =
		useRecordField(row.original.record, ({ payload }) => payload.date_expires_gmt) ?? null;
	const meta = table.options.meta as unknown as {
		onChange: (arg: { document: CouponDocument; changes: Record<string, unknown> }) => void;
	};
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();

	return (
		<CapabilityTooltip show={!readOnly && !caps.canEditCoupons} hint="editCoupons">
			<DatePickerInput
				value={dateExpiresGmt}
				onChange={(val) => meta.onChange({ document: item, changes: { date_expires_gmt: val } })}
				disabled={readOnly || !caps.canEditCoupons}
			/>
		</CapabilityTooltip>
	);
}
