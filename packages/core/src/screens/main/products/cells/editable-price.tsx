import * as React from 'react';

import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { CapabilityTooltip } from '../../components/capability-tooltip';
import { MoneyInput } from '../../components/money-input';
import { useProAccess } from '../../contexts/pro-access';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

/**
 *
 */
export function EditablePrice({
	row,
	column,
	table,
}: CellContext<
	{
		record: EngineRecord<'products'> | EngineRecord<'variations'>;
	},
	'sale_price' | 'regular_price'
>) {
	const record = row.original.record;
	const priceKey = column.id as 'sale_price' | 'regular_price';
	const price = useRecordField(record, ({ payload }) => payload[priceKey]) as string;
	const fields = useRecordField(record, ({ payload }) => ({
		type: payload.type,
		onSale: payload.on_sale,
	}));
	const meta = table.options.meta as unknown as {
		onChange: (arg: {
			document: EngineRecord<'products'> | EngineRecord<'variations'>;
			changes: Record<string, unknown>;
		}) => void | Promise<boolean>;
	};
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const canEdit = fields.type === 'variation' ? caps.canEditVariations : caps.canEditProducts;
	const { format } = useCurrencyFormat();

	/**
	 *
	 */
	return (
		<CapabilityTooltip show={!readOnly && !canEdit} hint="editProducts">
			{/* The cart's price (its keypad on web) without quick keys: a −10% on a catalogue
			    price is a permanent markdown (Paul 2026-10-27). A blank price rests as `–`. */}
			<MoneyInput
				value={price}
				format={format}
				formatOptions={{ fixedDecimalScale: true }}
				onChangeText={(price) =>
					meta.onChange({
						document: record,
						changes: { [column.id]: String(price) },
					})
				}
				disabled={readOnly || !canEdit || (column.id === 'sale_price' && !fields.onSale)}
			/>
		</CapabilityTooltip>
	);
}
