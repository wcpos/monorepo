import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';
import { type EngineRecord, useDocField } from '@wcpos/query';
import { sanitizeVariationAttributesRead } from '@wcpos/query/collection-map';

import { DataTableRow } from '../../../../components/data-table/rows';
import { resolveVariationName } from '../../../../components/product/resolve-variation-name';
import { InCartCount, useVariationCount } from './product-row';
import { useAddVariation } from '../../../hooks/use-add-variation';

export { ProductVariationName as VariationName } from '../../cells/variation-name';
export { StockQuantity as VariationStock } from '../../cells/stock-quantity';

type Attributes = import('@wcpos/database').ProductVariationDocument['attributes'];

type Props = {
	item: React.ComponentProps<typeof DataTableRow<{ record: EngineRecord<'variations'> }>>['item'];
	parent: EngineRecord<'products'>;
};
export function VariationRow({ item, parent }: Props) {
	const variation = item.original.record;
	const attributes = useDocField(variation, (value) => value.payload.attributes);
	const name = useDocField(variation, (value) => resolveVariationName(value.payload));
	const count = useVariationCount(variation);
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
			// The row's name, for when the Actions column is hidden and the row is the add control.
			accessibilityLabel={name}
			trailing={
				<InCartCount
					product={variation.uuid}
					count={count}
					onPress={add}
					empty={
						<IconButton
							name="circlePlus"
							testID="add-variation-to-cart-button"
							onPress={(e) => {
								e.stopPropagation();
								void add();
							}}
						/>
					}
				/>
			}
		/>
	);
}
