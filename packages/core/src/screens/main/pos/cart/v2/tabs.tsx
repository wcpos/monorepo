import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import { Button } from '@wcpos/components/button';
import { IconButton } from '@wcpos/components/icon-button';
import { useIsPhone } from '@wcpos/components/lib/device';
import { Text } from '@wcpos/components/text';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useEngineRecord } from '../../../hooks/use-engine-document';
import { finishReceipt, selectReceipt, useCheckoutMode } from '../../checkout/checkout-mode';
import { useResumeTerminalLegsForOrders } from '../../checkout/payments/server/use-resume-terminal-legs';
import { useCurrentOrder } from '../../contexts/current-order';
import { CartTabTitle } from '../tab-title';
import { OpenOrdersList } from './open-orders-list';
import { TabChip } from './tab-chip';

export function OpenOrderTabs() {
	const { currentOrderRecord, openOrders, setCurrentOrderID } = useCurrentOrder();
	useResumeTerminalLegsForOrders(openOrders.map(({ record }) => record));
	const t = useT();
	const phone = useIsPhone();
	const { receiptOrders, selectedReceiptOrder } = useCheckoutMode();
	const extraReceiptIds = [...receiptOrders].filter(
		(uuid) => !openOrders.some((order) => order.id === uuid)
	);
	const [listOpen, setListOpen] = React.useState(false);
	const scroll = React.useRef<React.ElementRef<typeof ScrollView>>(null);
	const positions = React.useRef(new Map<string, number>());
	const tabs = React.useRef(new Map<string, React.ElementRef<typeof Pressable>>());
	const scrollX = React.useRef(0);
	const viewport = React.useRef(0);
	const activeValue =
		selectedReceiptOrder ??
		((currentOrderRecord as { isNew?: boolean }).isNew ? 'new' : currentOrderRecord.uuid);
	const handleTabPress = React.useCallback(
		(orderId: string) => {
			if (receiptOrders.has(orderId)) {
				selectReceipt(orderId);
				return;
			}
			selectReceipt(null);
			setCurrentOrderID(orderId === 'new' ? '' : orderId);
		},
		[setCurrentOrderID, receiptOrders]
	);
	const reveal = React.useCallback((id: string) => {
		const x = positions.current.get(id);
		if (x !== undefined) scroll.current?.scrollTo({ x, animated: true });
	}, []);
	// Selection changes outside this strip must reveal the active tab in the native scroll view.
	React.useEffect(() => {
		reveal(activeValue);
	}, [activeValue, reveal]);
	const closeList = (id = activeValue) => {
		setListOpen(false);
		// The new-order holder is a View: focus the button inside it where the platform allows.
		const target = tabs.current.get(id) as unknown as
			| { focus?: () => void; querySelector?: (s: string) => { focus?: () => void } | null }
			| undefined;
		(target?.querySelector?.('button') ?? target)?.focus?.();
	};
	const renderTab = (id: string, content: React.ReactNode) => (
		<Pressable
			key={id}
			testID={`open-order-tab-${id}`}
			role="tab"
			aria-selected={id === activeValue}
			ref={(node) => {
				if (node) tabs.current.set(id, node);
				else tabs.current.delete(id);
			}}
			onLayout={({ nativeEvent }) => {
				positions.current.set(id, nativeEvent.layout.x);
				if (id === activeValue) reveal(id);
			}}
			onPress={() => handleTabPress(id)}
			className={`h-ctl active:bg-muted justify-center px-3 ${id === activeValue ? 'border-primary border-b-2' : ''}`}
		>
			{content}
		</Pressable>
	);
	return (
		<>
			<View className="bg-background flex-row items-center">
				<Button variant="ghost" testID="open-orders-count" onPress={() => setListOpen(true)}>
					<Text>{t('pos_cart.open_orders_count', { count: openOrders.length })}</Text>
				</Button>
				<View className="min-w-0 flex-1">
					<ScrollView
						ref={scroll}
						horizontal
						showsHorizontalScrollIndicator={false}
						onLayout={({ nativeEvent }) => {
							viewport.current = nativeEvent.layout.width;
						}}
						onScroll={({ nativeEvent }) => {
							scrollX.current = nativeEvent.contentOffset.x;
						}}
						scrollEventThrottle={16}
					>
						{openOrders.map(({ id, record }) =>
							renderTab(id, <TabContent order={record} active={id === activeValue} phone={phone} />)
						)}
						{extraReceiptIds.map((uuid) =>
							renderTab(
								uuid,
								// Suspend receipt content only: one loading receipt must not hide the other tabs.
								<React.Suspense fallback={null}>
									<ReceiptTabContent uuid={uuid} active={uuid === activeValue} phone={phone} />
								</React.Suspense>
							)
						)}
					</ScrollView>
					<View pointerEvents="none" className="bg-background/80 absolute inset-y-0 left-0 w-2" />
					<View pointerEvents="none" className="bg-background/80 absolute inset-y-0 right-0 w-2" />
				</View>
				<IconButton
					name="chevronRight"
					testID="scrollable-tabs-next"
					accessibilityLabel={t('pos_cart.next_orders')}
					onPress={() =>
						scroll.current?.scrollTo({ x: scrollX.current + viewport.current, animated: true })
					}
				/>
				{/* A View, not a Pressable: the wrapper only holds the focus target for the list's
				    close and must not add a dead tab stop beside the real button. */}
				<View
					ref={(node) => {
						if (node)
							tabs.current.set('new', node as unknown as React.ElementRef<typeof Pressable>);
						else tabs.current.delete('new');
					}}
				>
					<IconButton
						name="plus"
						testID="new-order-tab"
						accessibilityLabel={t('pos_cart.new_order')}
						onPress={() => handleTabPress('new')}
					/>
				</View>
			</View>
			{listOpen && (
				<OpenOrdersList
					orders={openOrders}
					activeValue={activeValue}
					onSelect={handleTabPress}
					onClose={closeList}
				/>
			)}
		</>
	);
}
function TabContent({
	order,
	active,
	phone,
}: {
	order: EngineRecord<'orders'>;
	active: boolean;
	phone: boolean;
}) {
	return (
		<View className={`items-center gap-1 tabular-nums ${phone ? 'flex-row' : ''}`}>
			<CartTabTitle order={order} />
			<TabChip order={order} active={active} compact={phone} />
		</View>
	);
}
function ReceiptTabContent({
	uuid,
	active,
	phone,
}: {
	uuid: string;
	active: boolean;
	phone: boolean;
}) {
	const resource = useEngineRecord('orders', uuid);
	const record = useObservableSuspense(resource);
	// A receipt whose order is gone (store switch, purge) leaves the strip rather than
	// lingering as an empty tab; the store write is what removes the trigger above.
	React.useEffect(() => {
		if (!record) finishReceipt(uuid);
	}, [record, uuid]);
	if (!record) return null;
	return <TabContent order={record} active={active} phone={phone} />;
}
