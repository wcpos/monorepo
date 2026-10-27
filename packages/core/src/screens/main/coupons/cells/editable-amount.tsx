import * as React from 'react';

import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { MoneyInput } from '../../components/money-input';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { PERCENT_FORMAT, PERCENT_PLACES, useNumberFormat } from '../../hooks/use-number-format';
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
	const meta = table.options.meta as unknown as {
		onChange: (arg: {
			document: EngineRecord<'coupons'>;
			changes: Record<string, unknown>;
		}) => void;
	};
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const { format } = useCurrencyFormat();
	const { format: formatNumber } = useNumberFormat(PERCENT_FORMAT);

	return (
		<CapabilityTooltip show={!readOnly && !caps.canEditCoupons} hint="editCoupons">
			{/* The cart's price keypad on web, as the Products grid's prices (#2984), without
			    quick keys: a −10% on a coupon's amount is a different coupon. It keeps its
			    input field outline (Paul 2026-10-27). */}
			<MoneyInput
				field
				value={amount}
				format={percent ? formatNumber : format}
				formatOptions={percent ? undefined : { fixedDecimalScale: true }}
				decimals={percent ? PERCENT_PLACES : undefined}
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
