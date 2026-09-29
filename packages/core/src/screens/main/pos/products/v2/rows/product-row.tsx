import * as React from 'react';
import { View } from 'react-native';

import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useDocField } from '@wcpos/query';

import { useT } from '../../../../../../contexts/translations';
import { useCurrentOrder } from '../../../contexts/current-order';
import { useAddProduct } from '../../../hooks/use-add-product';
import { DataTableRow } from '../../../../components/data-table/v2/rows';

export function useProductCount(record: EngineRecord<'products'>) {
	const { currentOrderRecord } = useCurrentOrder();
	return useDocField(
		currentOrderRecord,
		(value) =>
			(value.payload.line_items ?? []).filter(
				(line: { product_id?: number }) => line.product_id === Number(record.remoteId)
			).length
	);
}
export function InCartCount({ count }: { count: number }) {
	const t = useT();
	return (
		<View
			accessibilityLabel={t('pos_products.in_cart_count', { count })}
			className="bg-primary size-6 items-center justify-center rounded-full"
		>
			<Text className="text-primary-foreground">{count}</Text>
		</View>
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
				count ? (
					<InCartCount count={count} />
				) : (
					<IconButton
						name="circlePlus"
						testID="add-to-cart-button"
						onPress={(event) => {
							event.stopPropagation();
							void addProduct(record);
						}}
					/>
				)
			}
		/>
	);
}
