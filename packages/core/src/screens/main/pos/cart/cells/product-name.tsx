import * as React from 'react';
import { View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { formatMetaDataValue } from '../../../components/format-meta-data-value';
import { EditCartItemButton } from './edit-cart-item-button';
import { EditLineItem } from './edit-line-item';
import { useT } from '../../../../../contexts/translations';
import { EditableField } from '../../../components/editable-field';
import { useCurrentOrder } from '../../contexts/current-order';
import { stockRejection$ } from '../../hooks/stock-rejection';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';

import type { CellContext } from '@tanstack/react-table';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}

/**
 *
 */
export function ProductName({ row, column }: CellContext<Props, 'name'>) {
	const { item, uuid } = row.original;
	const { updateLineItem } = useUpdateLineItem();
	const { currentOrder } = useCurrentOrder();
	const stockRejection = useObservableEagerState(stockRejection$);
	const t = useT();

	/**
	 * Highlight lines the server rejected at checkout, until the quantity no
	 * longer exceeds what the server said was available (self-clearing).
	 */
	const rejectedItem = React.useMemo(() => {
		if (!stockRejection || stockRejection.orderUuid !== currentOrder.uuid) return null;
		const match = stockRejection.items.find(
			(rejected) =>
				rejected.product_id === (item.product_id ?? 0) &&
				rejected.variation_id === (item.variation_id ?? 0)
		);
		if (!match) return null;
		if (match.available !== null) {
			const rejectedGroup = stockRejection.items.filter(
				(rejected) =>
					rejected.product_id === match.product_id &&
					rejected.available === match.available &&
					rejected.reason === match.reason &&
					rejected.backorders === match.backorders
			);
			const aggregateQuantity = (currentOrder.line_items ?? []).reduce((total, lineItem) => {
				const belongsToRejectedGroup = rejectedGroup.some(
					(rejected) =>
						rejected.product_id === (lineItem.product_id ?? 0) &&
						rejected.variation_id === (lineItem.variation_id ?? 0)
				);
				if (!belongsToRejectedGroup || !Number.isFinite(lineItem.quantity)) return total;
				return total + (lineItem.quantity ?? 0);
			}, 0);
			if (Number(aggregateQuantity.toFixed(12)) <= match.available) return null;
		}
		return match;
	}, [
		stockRejection,
		currentOrder.uuid,
		currentOrder.line_items,
		item.product_id,
		item.variation_id,
	]);

	/**
	 * filter out the private meta data
	 */
	const metaData = React.useMemo(
		() =>
			(item.meta_data ?? []).filter((meta) => {
				if (meta.key) {
					return !meta.key.startsWith('_');
				}
				return true;
			}),
		[item.meta_data]
	);

	/**
	 *
	 */
	return (
		<VStack className="w-full">
			<HStack className="gap-0">
				<View className="flex-1">
					<EditableField
						value={item.name}
						onChangeText={(name) => updateLineItem(uuid, { name })}
					/>
				</View>
				<EditCartItemButton title={t('common.edit_2', { name: item.name })}>
					<EditLineItem uuid={uuid} item={item} />
				</EditCartItemButton>
			</HStack>

			{rejectedItem && (
				<Text className="text-destructive text-xs font-semibold">
					{rejectedItem.available === null
						? t('common.out_of_stock')
						: t('pos_cart.n_available', { quantity: rejectedItem.available })}
				</Text>
			)}

			{column.columnDef.meta?.show?.('sku') && <Text className="text-sm">{item.sku}</Text>}

			{metaData.length > 0 && (
				<VStack space="xs">
					{metaData.map((meta: any) => (
						<HStack key={meta.id || meta.key || meta.display_key} className="flex-wrap gap-0">
							<Text
								className="text-muted-foreground text-xs"
								decodeHtml
							>{`${meta.display_key || meta.key}: `}</Text>
							<Text className="text-xs" decodeHtml>
								{formatMetaDataValue(meta.display_value || meta.value)}
							</Text>
						</HStack>
					))}
				</VStack>
			)}
		</VStack>
	);
}
