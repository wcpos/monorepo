import * as React from 'react';

import get from 'lodash/get';

import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { CurrencyInput } from '../../components/currency-input';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

/**
 *
 */
export function COGS({
	table,
	row,
}: CellContext<
	{
		record: EngineRecord<'products'> | EngineRecord<'variations'>;
	},
	'cost_of_goods_sold'
>) {
	const product = row.original.record;
	const cogs = useRecordField(row.original.record, (record) => record.payload.cost_of_goods_sold);
	const type = useRecordField(row.original.record, (record) => record.payload.type);
	const defined_value = get(cogs, ['values', 0, 'defined_value'], 0);
	const meta = table.options.meta as unknown as {
		onChange: (arg: {
			document: EngineRecord<'products'> | EngineRecord<'variations'>;
			changes: Record<string, unknown>;
		}) => void;
	};
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const canEdit = type === 'variation' ? caps.canEditVariations : caps.canEditProducts;

	/**
	 *
	 */
	return (
		<CapabilityTooltip show={!readOnly && !canEdit} hint="editProducts">
			<CurrencyInput
				value={defined_value}
				disabled={readOnly || !canEdit}
				onChangeText={(newValue) => {
					// Construct a plain object update (RxDB Proxy objects can't be cloned)
					const updatedCogs = {
						total_value: cogs?.total_value ?? 0,
						values: [
							{
								defined_value: newValue,
								effective_value: cogs?.values?.[0]?.effective_value ?? 0,
							},
						],
					};
					meta.onChange({
						document: product,
						changes: { cost_of_goods_sold: updatedCogs },
					});
				}}
			/>
		</CapabilityTooltip>
	);
}
