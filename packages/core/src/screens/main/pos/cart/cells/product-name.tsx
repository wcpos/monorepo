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
	const { currentOrder } = useCurrentOrder();
	const { updateLineItem } = useUpdateLineItem();
	const stockRejection = useObservableEagerState(stockRejection$);
	const t = useT();

	/**
	 * Highlight lines the server rejected at checkout, until the quantity no
	 * longer exceeds what the server said was available (self-clearing).
	 */
	const rejectedItem = React.useMemo(() => {
		if (stockRejection?.orderUuid !== currentOrder.uuid) return null;
		const match = stockRejection?.items.find(
			(rejected) =>
				rejected.product_id === (item.product_id ?? 0) &&
				rejected.variation_id === (item.variation_id ?? 0)
		);
		if (!match) return null;
		if (match.available !== null && (item.quantity ?? 0) <= match.available) return null;
		return match;
	}, [stockRejection, currentOrder.uuid, item.product_id, item.variation_id, item.quantity]);

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
