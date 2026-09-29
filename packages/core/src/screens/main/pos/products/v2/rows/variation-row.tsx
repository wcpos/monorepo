import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { StatusBadge } from '@wcpos/components/status-badge';
import { type EngineRecord, useDocField } from '@wcpos/query';
import { sanitizeVariationAttributesRead } from '@wcpos/query/collection-map';

import { DataTableRow } from '../../../../components/data-table/v2/rows';
import { resolveVariationName } from '../../../../components/product/resolve-variation-name';
import { displayStockStatus } from '../../../../components/product/resolve-stock';
import { useStockStatusLabel } from '../../../../hooks/use-stock-status-label';
import { useAddVariation } from '../../../hooks/use-add-variation';

type Attributes = import('@wcpos/database').ProductVariationDocument['attributes'];

type Props = {
	item: React.ComponentProps<typeof DataTableRow<{ record: EngineRecord<'variations'> }>>['item'];
	parent: EngineRecord<'products'>;
};
export function VariationName({ row }: { row: Props['item'] }) {
	const payload = useDocField(row.original.record, (value) => value.payload);
	return (
		<>
			<Text decodeHtml>{resolveVariationName(payload)}</Text>
			<Text className="text-muted-foreground text-sm" decodeHtml>
				{(sanitizeVariationAttributesRead(payload.attributes) as Attributes)
					?.map((attribute) => `${attribute.name}: ${attribute.option}`)
					.join(', ')}
			</Text>
		</>
	);
}
export function VariationStock({ row }: { row: Props['item'] }) {
	const stock = useDocField(row.original.record, (value) => displayStockStatus(value.payload));
	const { getLabel } = useStockStatusLabel();
	return (
		<StatusBadge
			label={getLabel(stock ?? 'instock')}
			variant={stock === 'lowstock' ? 'warning' : stock === 'outofstock' ? 'error' : 'success'}
		/>
	);
}
export function VariationRow({ item, parent }: Props) {
	const variation = item.original.record;
	const attributes = useDocField(variation, (value) => value.payload.attributes);
	const { addVariation } = useAddVariation();
	const add = () =>
		addVariation(
			variation,
			parent,
			((sanitizeVariationAttributesRead(attributes) as Attributes) ?? []).map((attribute) => ({
				attr_id: attribute.id ?? 0,
				display_key: attribute.name,
				display_value: attribute.option,
			}))
		);
	return (
		<DataTableRow
			item={item}
			testID={`data-table-row-variation-${variation.remoteId ?? variation.uuid}`}
			onPress={add}
			// No `accessibilityLabel` (so no button role): the Price cell's tax tooltip is a
			// <button> on web, and a button may not nest in one. The row stays a focusable
			// pressable, as the product rows do.
		/>
	);
}
