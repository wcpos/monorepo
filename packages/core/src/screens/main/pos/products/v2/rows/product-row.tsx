import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';
import { type EngineRecord, useDocField } from '@wcpos/query';

import { useCurrentOrder } from '../../../contexts/current-order';
import { useAddProduct } from '../../../hooks/use-add-product';
import { DataTableRow } from '../../../../components/data-table/v2/rows';
import { InCartCount } from './in-cart-count';

export { InCartCount };

export function useProductCount(record: EngineRecord<'products'>) {
	const { currentOrderRecord } = useCurrentOrder();
	return useDocField(
		currentOrderRecord,
		// The cashier reads "how many are in the cart": quantities summed across the lines of
		// this product, not the number of lines. A born-local product has no remote id yet, and
		// `product_id: 0` is every miscellaneous line's id, so it matches nothing.
		(value) =>
			record.remoteId == null
				? 0
				: (value.payload.line_items ?? [])
						.filter((line: { product_id?: number }) => line.product_id === Number(record.remoteId))
						.reduce((sum: number, line: { quantity?: number }) => sum + (line.quantity ?? 1), 0)
	);
}
export function ProductRow({
	item,
}: Pick<React.ComponentProps<typeof DataTableRow<{ record: EngineRecord<'products'> }>>, 'item'>) {
	const record = item.original.record;
	const { addProduct } = useAddProduct();
	const count = useProductCount(record);
	return (
		<DataTableRow
			item={item}
			onPress={() => addProduct(record)}
			trailing={
				<InCartCount
					product={record.uuid}
					count={count}
					onPress={() => void addProduct(record)}
					empty={
						<IconButton
							name="circlePlus"
							testID="add-to-cart-button"
							onPress={(event) => {
								event.stopPropagation();
								void addProduct(record);
							}}
						/>
					}
				/>
			}
		/>
	);
}
