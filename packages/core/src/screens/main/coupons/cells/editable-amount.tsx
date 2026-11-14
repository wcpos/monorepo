import * as React from 'react';

import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { AmountField } from '../../components/amount-field';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

export function EditableAmount({
	row,
	column,
	table,
}: CellContext<{ record: EngineRecord<'coupons'> }, string>) {
	const item = row.original.record;
	const amount = useRecordField(row.original.record, ({ payload }) => payload.amount);
	const percent =
		useRecordField(row.original.record, ({ payload }) => payload.discount_type) === 'percent';
	const commit = table.options.meta?.commit;
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();

	return (
		<CapabilityTooltip show={!readOnly && !caps.canEditCoupons} hint="editCoupons">
			{/* The cart's price keypad on web, as the Products grid's prices (#2984), without
			    quick keys: a −10% on a coupon's amount is a different coupon. It keeps its
			    input field outline (Paul 2026-10-27). */}
			<AmountField
				kind={percent ? 'percent' : 'money'}
				value={amount}
				onCommit={(val) =>
					commit?.({
						document: item,
						changes: { [column.id]: String(val) },
					})
				}
				disabled={readOnly || !caps.canEditCoupons}
			/>
		</CapabilityTooltip>
	);
}
