import * as React from 'react';

import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { CurrencyInput } from '../../components/currency-input';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export function EditablePrice({
	row,
	column,
	table,
}: CellContext<
	{
		document: ProductDocument | ProductVariationDocument;
		record: EngineRecord<'products'> | EngineRecord<'variations'>;
	},
	'sale_price' | 'regular_price'
>) {
	const item = row.original.document;
	const record = row.original.record;
	const priceKey = column.id as 'sale_price' | 'regular_price';
	const price = useRecordField(record, ({ payload }) => payload[priceKey]) as string;
	const fields = useRecordField(record, ({ payload }) => ({
		type: payload.type,
		onSale: payload.on_sale,
	}));
	const meta = table.options.meta as unknown as {
		onChange: (arg: {
			document: ProductDocument | ProductVariationDocument;
			changes: Record<string, unknown>;
		}) => void;
	};
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const canEdit = fields.type === 'variation' ? caps.canEditVariations : caps.canEditProducts;

	/**
	 *
	 */
	return (
		<CapabilityTooltip show={!readOnly && !canEdit} hint="editProducts">
			<CurrencyInput
				value={price}
				onChangeText={(price) =>
					meta.onChange({
						document: item,
						changes: { [column.id]: String(price) },
					})
				}
				disabled={readOnly || !canEdit || (column.id === 'sale_price' && !fields.onSale)}
			/>
		</CapabilityTooltip>
	);
}
