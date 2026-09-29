import * as React from 'react';
import { View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { CellContext } from '@wcpos/core/table-types';

import { formatMetaDataValue } from '../../../../components/format-meta-data-value';
import { useT } from '../../../../../../contexts/translations';
import { EditableField } from '../../../../components/editable-field';
import { getStockRejectionForLine, stockRejection$ } from '../../../hooks/stock-rejection';
import { useUpdateLineItem } from '../../../hooks/use-update-line-item';
import { useCurrentOrder } from '../../../contexts/current-order';
type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}
export function ProductName({ row, column, table }: CellContext<Props, 'name'>) {
	const { item, uuid } = row.original;
	const { currentOrderRecord } = useCurrentOrder();
	const { updateLineItem } = useUpdateLineItem();
	const stockRejection = useObservableEagerState(stockRejection$);
	const t = useT();
	/**
	 * Highlight lines the server rejected at checkout, until the quantity no
	 * longer exceeds what the server said was available (self-clearing).
	 */
	const rejectedItem = React.useMemo(
		() =>
			getStockRejectionForLine({
				stockRejection,
				orderUuid: currentOrderRecord.uuid ?? '',
				lineItems: table.options.data
					.filter((line) => line.type === 'line_items')
					.map((line) => line.item),
				lineItem: item,
			}),
		[stockRejection, currentOrderRecord.uuid, table.options.data, item]
	);
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
	return (
		<VStack className="w-full gap-0">
			{/* No edit icon here: the line strip's Edit owns the dialog (Paul, 2026-09-29). */}
			<View className="w-full">
				<EditableField
					variant="ghost"
					bold={false}
					value={item.name}
					onChangeText={(name) => updateLineItem(uuid, { name })}
				/>
			</View>
			{rejectedItem && (
				<Text className="text-destructive text-xs font-semibold">
					{rejectedItem.available === null
						? t('common.out_of_stock')
						: t('pos_cart.n_available', { quantity: rejectedItem.available })}
				</Text>
			)}
			{column.columnDef.meta?.show?.('sku') && <Text className="text-sm">{item.sku}</Text>}
			{metaData.length > 0 && (
				<Text className="text-muted-foreground text-sm leading-tight" numberOfLines={2}>
					{metaData.map((meta, index) => (
						<React.Fragment key={meta.id || meta.key || meta.display_key}>
							{index > 0 && ' · '}
							<Text
								className="text-muted-foreground text-sm leading-tight"
								decodeHtml
							>{`${meta.display_key || meta.key}: `}</Text>
							{/* Keep the attribute selector on the value, not the whole subline. */}
							<Text
								className="text-muted-foreground text-sm leading-tight"
								decodeHtml
								testID={`cart-line-meta-${meta.display_key || meta.key}`}
							>
								{formatMetaDataValue(meta.display_value || meta.value)}
							</Text>
						</React.Fragment>
					))}
				</Text>
			)}
		</VStack>
	);
}
