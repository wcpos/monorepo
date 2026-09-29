import * as React from 'react';
import { Pressable, View } from 'react-native';

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
export function InCartCount({ count, onPress }: { count: number; onPress?: () => void }) {
	const t = useT();
	// Pressable when it stands in for the `+`: the badge is then the row's named add control,
	// and its target keeps the row token (the 44-pt floor) around the compact badge.
	const badge = (
		<View className="bg-primary size-6 items-center justify-center rounded-full">
			<Text className="text-primary-foreground">{count}</Text>
		</View>
	);
	if (!onPress) {
		return <View accessibilityLabel={t('pos_products.in_cart_count', { count })}>{badge}</View>;
	}
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={t('pos_products.in_cart_count', { count })}
			onPress={onPress}
			hitSlop={8}
			className="min-h-row min-w-row items-center justify-center"
		>
			{badge}
		</Pressable>
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
					<InCartCount count={count} onPress={() => void addProduct(record)} />
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
