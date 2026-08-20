import * as React from 'react';

import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { CurrencyInput } from '../../components/currency-input';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

type CouponDocument = import('@wcpos/database').CouponDocument;

export function EditableAmount({
	row,
	column,
	table,
}: CellContext<{ document: CouponDocument; record: EngineRecord<'coupons'> }, string>) {
	const item = row.original.document;
	const amount = useRecordField(row.original.record, ({ payload }) => payload.amount);
	const meta = table.options.meta as unknown as {
		onChange: (arg: { document: CouponDocument; changes: Record<string, unknown> }) => void;
	};
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();

	return (
		<CapabilityTooltip show={!readOnly && !caps.canEditCoupons} hint="editCoupons">
			<CurrencyInput
				value={amount}
				onChangeText={(val) =>
					meta.onChange({
						document: item,
						changes: { [column.id]: String(val) },
					})
				}
				disabled={readOnly || !caps.canEditCoupons}
			/>
		</CapabilityTooltip>
	);
}
