import * as React from 'react';
import { View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { CellContext } from '@wcpos/core/table-types';

import { formatMetaDataValue } from '../../../components/format-meta-data-value';
import { useT } from '../../../../../contexts/translations';
import { EditableField } from '../../../components/editable-field';
import { lineRef, useCartUnmet } from '../../conditions/use-cart-conditions';
import { getStockRejectionForLine, stockRejection$ } from '../../hooks/stock-rejection';
import { useUpdateCartLine } from '../../hooks/use-update-cart-line';
import { useCurrentOrder } from '../../contexts/current-order';
import { readOnlyLineKey, useCartTableReadOnly } from './read-only';
type LineItem = import('@wcpos/query').OrderLineItem;
interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}
export function ProductName({ row, column, table }: CellContext<Props, 'name'>) {
	const { item, uuid } = row.original;
	const readOnly = useCartTableReadOnly();
	const paidBy = readOnly?.paidBy?.[readOnlyLineKey(uuid, item)];
	const { currentOrderRecord } = useCurrentOrder();
	const { updateCartLine } = useUpdateCartLine();
	const stockRejection = useObservableEagerState(stockRejection$);
	const t = useT();
	const unmet = useCartUnmet().find((condition) => condition.lineUuid === uuid);
	const scrollRef = React.useMemo(
		() => lineRef(uuid, 'scroll', () => table.options.meta?.scrollToRow?.(uuid)),
		[uuid, table]
	);
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
	const stockMark = unmet ?? rejectedItem;
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
			{/* Read-only (checkout, receipt): the name the field shows, nothing to press, and no
			    scroll target — the stilled cart never scrolls to a row. */}
			<View className="w-full" ref={readOnly ? undefined : scrollRef}>
				{/* Two lines: the name is what the cashier reads, and the amount columns hold
				    their width at every scale step, so a long name wraps rather than truncates. */}
				{readOnly ? (
					<Text className="py-1.5" numberOfLines={2} decodeHtml>
						{item.name ?? ''}
					</Text>
				) : (
					<EditableField
						variant="ghost"
						bold={false}
						numberOfLines={2}
						value={item.name}
						onChangeText={(name) => updateCartLine('line_items', uuid, { name })}
					/>
				)}
			</View>
			{paidBy ? (
				<StatusBadge
					variant="success"
					label={t('pos_checkout.line_paid_by', { methods: paidBy.join(' + ') })}
				/>
			) : null}
			{stockMark && (
				// Attention, not destructive (rule 7); dark words on the amber tint (the amber is ~2.5:1 as text).
				<HStack
					className="bg-attention/15 items-center gap-1 self-start rounded px-1"
					testID="cart-line-stock-mark"
				>
					<Icon name="box" size="xs" variant="attention" />
					<Text className="text-foreground text-xs font-semibold">
						{(stockMark.available ?? 0) > 0
							? t('pos_cart.n_available', { quantity: stockMark.available! })
							: t('common.out_of_stock')}
					</Text>
				</HStack>
			)}
			{column.columnDef.meta?.show?.('sku') && <Text className="text-sm">{item.sku}</Text>}
			{metaData.length > 0 && (
				/* Native merges nested Text, so Maestro sees only the outer testID. */
				<Text
					className="text-muted-foreground text-sm leading-tight"
					numberOfLines={2}
					testID="cart-line-meta"
				>
					{metaData.map((meta, index) => (
						<React.Fragment key={meta.id || meta.key || meta.display_key}>
							{index > 0 && ' · '}
							<Text
								className="text-muted-foreground text-sm leading-tight"
								decodeHtml
							>{`${meta.display_key || meta.key}: `}</Text>
							{/* Keep the per-key id on the value for unit tests; native E2E uses the outer
							    cart-line-meta because native merges nested Text. */}
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
