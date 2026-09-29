import * as React from 'react';
import { Pressable, View } from 'react-native';

import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { type EngineRecord, useDocField } from '@wcpos/query';

import { useOrderStatusLabel } from '../../../hooks/use-order-status-label';
import { useT } from '../../../../../contexts/translations';
import { CartTabTitle } from '../tab-title';
import { TabChip } from './tab-chip';

type Order = { id: string; record: EngineRecord<'orders'> };
export function OpenOrdersList({
	orders,
	activeValue,
	onSelect,
	onClose,
}: {
	orders: readonly Order[];
	activeValue: string;
	onSelect: (id: string) => void;
	onClose: (id?: string) => void;
}) {
	const t = useT();
	return (
		<View testID="open-orders-list" className="bg-background absolute inset-0 z-50">
			<View className="h-ctl border-border flex-row items-center justify-between border-b px-2">
				<Text>{t('pos_cart.open_orders')}</Text>
				<IconButton
					name="xmark"
					testID="open-orders-close"
					accessibilityLabel={t('common.close')}
					onPress={() => onClose()}
				/>
			</View>
			{/* Virtualized: a store can hold thousands of open orders, and every row subscribes
			    to its record, save state and payment methods. */}
			<VirtualizedList.Root style={{ flex: 1 }}>
				<VirtualizedList.List
					data={orders}
					keyExtractor={(order) => order.id}
					estimatedItemSize={48}
					extraData={activeValue}
					renderItem={({ item: { id, record } }) => (
						<VirtualizedList.Item>
							<OrderRow
								order={record}
								selected={id === activeValue}
								onPress={() => {
									onSelect(id);
									onClose(id);
								}}
							/>
						</VirtualizedList.Item>
					)}
				/>
			</VirtualizedList.Root>
		</View>
	);
}
function OrderRow({
	order,
	selected,
	onPress,
}: {
	order: EngineRecord<'orders'>;
	selected: boolean;
	onPress: () => void;
}) {
	const t = useT();
	const { getLabel } = useOrderStatusLabel();
	const payload = useDocField(order, (value) => value.payload);
	const billing = payload.billing;
	const focusCurrent = React.useCallback(
		(node: React.ElementRef<typeof Pressable> | null) => {
			if (selected) node?.focus();
		},
		[selected]
	);
	const name = [billing?.first_name, billing?.last_name].filter(Boolean).join(' ');
	return (
		<Pressable
			testID={`open-orders-row-${order.uuid}`}
			role="button"
			aria-selected={selected}
			ref={focusCurrent}
			onPress={onPress}
			className={`min-h-row border-border active:bg-muted flex-row items-center gap-2 border-b p-2 ${selected ? 'bg-muted' : ''}`}
		>
			<View className="tabular-nums">
				<CartTabTitle order={order} />
			</View>
			<Text className="flex-1">{name || t('pos_cart.guest')}</Text>
			<TabChip order={order} fallbackLabel={getLabel(payload.status)} />
			{selected && <Text>{t('pos_cart.selected')}</Text>}
		</Pressable>
	);
}
