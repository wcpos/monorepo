import * as React from 'react';
import { Pressable, View } from 'react-native';

import { decode } from 'html-entities';

import { Avatar, getInitials } from '@wcpos/components/avatar';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { type EngineRecord, useDocField } from '@wcpos/query';

import { useOrderStatusLabel } from '../../../hooks/use-order-status-label';
import { useT } from '../../../../../contexts/translations';
import { convertUTCStringToLocalDate } from '../../../../../hooks/use-local-date';
import { useNowMs, useRelativeTime } from '../../../../../hooks/use-relative-time';
import { CartTabTitle } from '../tab-title';
import { TabChip } from './tab-chip';

// The ages tick once a minute: "4 min" need not be exact, and a list of hundreds of rows
// must not re-render every second.
const AGE_TICK_MS = 60_000;
// A cart parked for an hour is one somebody forgot: its age turns the warning colour so it
// stands out from the live ones (Blaze's "parked list grows stale" in one row).
const STALE_AFTER_MS = 60 * 60_000;

type Order = { id: string; record: EngineRecord<'orders'> };
export function OpenOrdersList({
	orders,
	activeValue,
	leaving = false,
	onSelect,
	onClose,
}: {
	orders: readonly Order[];
	activeValue: string;
	/** The list is sliding out: focus has gone back to the strip and must stay there. */
	leaving?: boolean;
	onSelect: (id: string) => void;
	onClose: (id?: string) => void;
}) {
	const t = useT();
	const nowMs = useNowMs(AGE_TICK_MS);
	return (
		<View testID="open-orders-list" className="flex-1">
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
					estimatedItemSize={60}
					extraData={`${activeValue}:${leaving}:${nowMs}`}
					renderItem={({ item: { id, record } }) => (
						<VirtualizedList.Item>
							<OrderRow
								order={record}
								selected={id === activeValue}
								takesFocus={!leaving}
								nowMs={nowMs}
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

/**
 * Who, what, how much, how long, and the status (board, chosen 2026-10-09). The item line
 * is what a cashier remembers a cart by when the customer is "Guest"; the age is a quiet
 * number until the cart has waited an hour. Nothing appears on hover: the row is the button.
 */
function OrderRow({
	order,
	selected,
	takesFocus,
	nowMs,
	onPress,
}: {
	order: EngineRecord<'orders'>;
	selected: boolean;
	takesFocus: boolean;
	nowMs: number;
	onPress: () => void;
}) {
	const t = useT();
	const { getLabel } = useOrderStatusLabel();
	const relative = useRelativeTime();
	const payload = useDocField(order, (value) => value.payload);
	const billing = payload.billing;
	const focusCurrent = React.useCallback(
		(node: React.ElementRef<typeof Pressable> | null) => {
			// The row is focused while its list is still sliding in: without `preventScroll` the
			// browser scrolls the clipping frame to bring it into view and the slide jumps.
			if (selected && takesFocus)
				(node as { focus?: (options?: FocusOptions) => void } | null)?.focus?.({
					preventScroll: true,
				});
		},
		[selected, takesFocus]
	);
	const name = [billing?.first_name, billing?.last_name].filter(Boolean).join(' ');
	const items = (payload.line_items ?? [])
		.map(({ name: item, quantity }: { name?: string; quantity?: number | string }) =>
			Number(quantity) > 1 ? `${decode(item ?? '')} ×${quantity}` : decode(item ?? '')
		)
		.filter(Boolean)
		.join(', ');
	const openedMs = payload.date_created_gmt
		? convertUTCStringToLocalDate(payload.date_created_gmt).getTime()
		: undefined;
	const stale = openedMs !== undefined && nowMs - openedMs >= STALE_AFTER_MS;
	return (
		<Pressable
			testID={`open-orders-row-${order.uuid}`}
			role="button"
			aria-selected={selected}
			ref={focusCurrent}
			onPress={onPress}
			className={`border-border web:hover:bg-muted active:bg-muted min-h-row flex-row items-center gap-3 border-b border-l-2 py-2 pr-3 pl-2 ${selected ? 'bg-muted border-l-primary' : 'border-l-transparent'}`}
		>
			{name ? (
				<Avatar fallback={getInitials(name)} size="md" />
			) : (
				<View className="bg-muted size-9 items-center justify-center rounded-full">
					<Icon name="user" size="sm" className="text-muted-foreground" />
				</View>
			)}
			<View className="min-w-0 flex-1">
				<HStack space="xs">
					<Text className="shrink font-semibold" numberOfLines={1}>
						{name || t('pos_cart.guest')}
					</Text>
					{/* The check says "this one is open" without leaning on the fill alone. */}
					{selected && (
						<View testID={`open-orders-row-${order.uuid}-current`}>
							<Icon name="check" size="sm" className="text-primary" />
						</View>
					)}
				</HStack>
				<Text
					testID={`open-orders-row-${order.uuid}-items`}
					className="text-muted-foreground text-xs"
					numberOfLines={1}
				>
					{items || t('pos_cart.cart_empty')}
				</Text>
			</View>
			<View className="items-end gap-0.5">
				<View className="tabular-nums">
					<CartTabTitle order={order} amountOnly active />
				</View>
				<HStack space="sm">
					{openedMs !== undefined && (
						<HStack space="xs">
							<Icon
								name="clock"
								size="xs"
								className={stale ? 'text-warning' : 'text-muted-foreground'}
							/>
							<Text
								testID={`open-orders-row-${order.uuid}-age`}
								className={`text-xs ${stale ? 'text-warning font-semibold' : 'text-muted-foreground'}`}
							>
								{relative(openedMs, nowMs)}
							</Text>
						</HStack>
					)}
					<TabChip order={order} fallbackLabel={getLabel(payload.status)} fallbackIsStatus />
				</HStack>
			</View>
		</Pressable>
	);
}
