import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';
import Animated, { LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { Badge } from '@wcpos/components/badge';
import { Icon } from '@wcpos/components/icon';
import { useIsPhone } from '@wcpos/components/lib/device';
import { CROSSFADE, EASE } from '@wcpos/components/lib/motion';
import { SlideOver } from '@wcpos/components/slide-over';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useEngineRecord } from '../../../hooks/use-engine-document';
import { finishReceipt, selectReceipt, useCheckoutMode } from '../../checkout/checkout-mode';
import { useResumeTerminalLegsForOrders } from '../../checkout/payments/server/use-resume-terminal-legs';
import { useCurrentOrder } from '../../contexts/current-order';
import { CartTabTitle } from '../tab-title';
import { OpenOrdersList } from './open-orders-list';
import { TabChip } from './tab-chip';
import { TAB_MIN, tabWindow } from './tab-window';

// Every control in the strip is a full-height cell: the hover and the press fill the
// rectangle (Paul, 2026-10-09), never a round button inside it.
const CELL = 'web:hover:bg-muted active:bg-muted h-full items-center justify-center';
// A tab is as wide as its text (Paul, 2026-10-09): the same classes measure it and show it.
const TAB = 'h-full min-w-0 justify-center border-b-2 px-3';
// A step slides the row by the width of the tab that left it.
const SHIFT = LinearTransition.duration(CROSSFADE).easing(EASE).reduceMotion(ReduceMotion.System);

export function OpenOrderTabs({
	position = 'bottom',
	onCoverChange,
}: {
	position?: 'top' | 'bottom';
	/** The list is covering the cart (or has stopped): the host takes the cart out of reach. */
	onCoverChange?: (covered: boolean) => void | Promise<void>;
}) {
	const { currentOrderRecord, openOrders, openOrdersScope, setCurrentOrderID } = useCurrentOrder();
	useResumeTerminalLegsForOrders(openOrders.map(({ record }) => record));
	const t = useT();
	const phone = useIsPhone();
	const { receiptOrders, selectedReceiptOrder } = useCheckoutMode();
	const extraReceiptIds = [...receiptOrders].filter(
		(uuid) => !openOrders.some((order) => order.id === uuid)
	);
	const [listOpen, setListOpenState] = React.useState(false);
	// The host hears about the cover in the same handler that opens or closes the list, so
	// the covered cart is out of reach in the frame the list appears.
	const setListOpen = (open: boolean) => {
		setListOpenState(open);
		void onCoverChange?.(open);
	};
	// The strip unmounting (the column shows the register picker instead) uncovers the cart.
	const uncover = React.useRef(onCoverChange);
	React.useEffect(() => {
		uncover.current = onCoverChange;
	}, [onCoverChange]);
	React.useEffect(() => () => void uncover.current?.(false), []);
	// Where the strip sits in the cart column: the list covers the cart on the far side of it.
	const [strip, setStrip] = React.useState({ y: 0, height: 0, width: 0 });
	const tabs = React.useRef(new Map<string, React.ElementRef<typeof Pressable>>());
	const activeValue =
		selectedReceiptOrder ??
		((currentOrderRecord as { isNew?: boolean }).isNew ? 'new' : currentOrderRecord.uuid);
	// A fresh cart is not an open order until its first line, but the cashier is on it: the
	// board shows the current cart as a tab, so it is the last one here, before the +.
	const freshCart =
		activeValue === 'new'
			? [{ id: 'new', record: currentOrderRecord as EngineRecord<'orders'> }]
			: [];
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
	const closeList = (id = activeValue) => {
		setListOpen(false);
		(tabs.current.get(id) as unknown as { focus?: () => void } | undefined)?.focus?.();
	};
	// Every tab in strip order: open orders, the fresh cart, then receipts of orders that
	// have left the open list.
	// `measure` is the same content without its testIDs, for the off-stage measuring row:
	// a testID must point at one element.
	const entries: { id: string; content: React.ReactNode; measure: React.ReactNode }[] = [
		...[...openOrders, ...freshCart].map(({ id, record }) => ({
			id,
			content: <TabContent order={record} active={id === activeValue} phone={phone} />,
			measure: <TabContent order={record} active={id === activeValue} phone={phone} measuring />,
		})),
		...extraReceiptIds.map((uuid) => ({
			id: uuid,
			content: (
				// Suspend receipt content only: one loading receipt must not hide the other tabs.
				<React.Suspense fallback={null}>
					<ReceiptTabContent uuid={uuid} active={uuid === activeValue} phone={phone} />
				</React.Suspense>
			),
			measure: (
				<React.Suspense fallback={null}>
					<ReceiptTabContent uuid={uuid} active={uuid === activeValue} phone={phone} measuring />
				</React.Suspense>
			),
		})),
	];
	const activeIndex = Math.max(
		entries.findIndex(({ id }) => id === activeValue),
		0
	);
	const step = (delta: number) => {
		const next = entries[activeIndex + delta];
		if (next) handleTabPress(next.id);
	};
	// Each tab's own width, measured off stage (below) for the carts around the open one;
	// an unmeasured tab counts as the minimum until its layout lands. Bounded: carts that
	// have left the strip leave the map (orders close all day).
	const [widths, setWidths] = React.useState<ReadonlyMap<string, number>>(() => new Map());
	const live = new Set(entries.map(({ id }) => id));
	// Before the first layout every tab is on the row: the same shape, measured next frame.
	const window =
		strip.width > 0
			? tabWindow({
					width: strip.width,
					widths: entries.map(({ id }) => widths.get(id) ?? TAB_MIN),
					active: activeIndex,
				})
			: { fits: true, start: 0, end: entries.length, tray: false, left: false, right: false };
	// Only carts that could reach the row are measured: the row holds at most this many
	// minimum-width tabs either side of the open one.
	const reach = Math.ceil((strip.width || 800) / TAB_MIN) + 1;
	const toMeasure = entries.slice(Math.max(activeIndex - reach, 0), activeIndex + reach + 1);
	// A sole cart has nothing to be selected against: no underline (board, "One cart").
	const solo = entries.length === 1;
	const renderTab = ({ id, content }: (typeof entries)[number]) => {
		const active = id === activeValue;
		return (
			<Animated.View key={id} layout={SHIFT} className="h-full">
				<Pressable
					testID={`open-order-tab-${id}`}
					role="tab"
					aria-selected={active}
					ref={(node) => {
						if (node) tabs.current.set(id, node);
						else tabs.current.delete(id);
					}}
					onPress={() => {
						handleTabPress(id);
						setListOpen(false);
					}}
					style={{ minWidth: TAB_MIN }}
					className={`${TAB} web:hover:bg-muted active:bg-muted ${active && !solo ? 'border-primary' : 'border-transparent'}`}
				>
					{content}
				</Pressable>
			</Animated.View>
		);
	};
	return (
		<>
			<View
				testID="open-order-strip"
				className="bg-card border-border h-13 flex-row items-stretch border-t"
				onLayout={({ nativeEvent: { layout } }) => {
					setStrip((was) =>
						was.y === layout.y && was.height === layout.height && was.width === layout.width
							? was
							: { y: layout.y, height: layout.height, width: layout.width }
					);
				}}
			>
				{window.tray && (
					<Pressable
						role="button"
						className={`${CELL} border-border w-14 flex-row gap-1 border-r ${listOpen ? 'bg-muted' : ''}`}
						testID="open-orders-count"
						accessibilityLabel={t('pos_cart.open_orders_count', { count: openOrders.length })}
						aria-expanded={listOpen}
						onPress={() => (listOpen ? closeList() : setListOpen(true))}
					>
						{/* The pill must read "0" when the strip is empty. */}
						{/* Keyed on the scope: another cashier's or register's count arriving is not a change. */}
						<Badge
							variant="muted"
							count={openOrders.length}
							max={Infinity}
							showZero
							identity={openOrdersScope}
						/>
						{/* The chevron points the way the list will travel. */}
						<Icon
							name={listOpen === (position === 'bottom') ? 'chevronDown' : 'chevronUp'}
							size="sm"
							className="text-muted-foreground"
						/>
					</Pressable>
				)}
				{window.left && (
					<Pressable
						role="button"
						className={`${CELL} w-9`}
						testID="scrollable-tabs-prev"
						accessibilityLabel={t('pos_cart.previous_cart')}
						onPress={() => step(-1)}
					>
						<Icon name="chevronLeft" className="text-muted-foreground" />
					</Pressable>
				)}
				<View
					role="tablist"
					className="min-w-0 flex-1 flex-row overflow-hidden"
					onKeyDown={
						Platform.OS === 'web'
							? (event) => {
									const key = event.nativeEvent.key;
									if ((key === 'ArrowLeft' || key === 'ArrowRight') && !event.defaultPrevented) {
										event.preventDefault();
										step(key === 'ArrowLeft' ? -1 : 1);
									}
								}
							: undefined
					}
				>
					{entries.slice(window.start, window.end).map(renderTab)}
					{/* The measuring row: the same tabs at their own width, off stage. It is never
					    read by a cashier or a screen reader, only by the layout pass. */}
					<View
						aria-hidden
						pointerEvents="none"
						className="absolute top-0 h-full flex-row opacity-0"
						style={{ left: -100000 }}
					>
						{toMeasure.map(({ id, measure }) => (
							<View
								key={id}
								onLayout={({ nativeEvent: { layout } }) => {
									const width = Math.ceil(layout.width);
									setWidths((was) => {
										if (was.get(id) === width && [...was.keys()].every((k) => live.has(k)))
											return was;
										return new Map([...was].filter(([k]) => live.has(k))).set(id, width);
									});
								}}
								className={TAB}
								style={{ minWidth: TAB_MIN }}
							>
								{measure}
							</View>
						))}
					</View>
				</View>
				{window.right && (
					<Pressable
						role="button"
						className={`${CELL} w-9`}
						testID="scrollable-tabs-next"
						accessibilityLabel={t('pos_cart.next_cart')}
						onPress={() => step(1)}
					>
						<Icon name="chevronRight" className="text-muted-foreground" />
					</Pressable>
				)}
				<Pressable
					role="button"
					className={`${CELL} w-12`}
					testID="new-order-tab"
					accessibilityLabel={t('pos_cart.new_order')}
					ref={(node) => {
						if (node) tabs.current.set('new', node);
						else tabs.current.delete('new');
					}}
					onPress={() => {
						handleTabPress('new');
						// The strip stays pressable beside the open list: the fresh cart must not
						// be left covered by it.
						setListOpen(false);
					}}
				>
					<Icon name="plus" />
				</Pressable>
			</View>
			{/* The list comes out of the strip and covers the cart beside it; the strip stays put. */}
			<SlideOver
				open={listOpen}
				from={position}
				className="absolute inset-x-0 z-50"
				style={
					position === 'bottom'
						? { top: 0, height: strip.y }
						: { top: strip.y + strip.height, bottom: 0 }
				}
				coverClassName="bg-card"
			>
				<OpenOrdersList
					orders={openOrders}
					activeValue={activeValue}
					leaving={!listOpen}
					onSelect={handleTabPress}
					onClose={closeList}
				/>
			</SlideOver>
		</>
	);
}

function TabContent({
	order,
	active,
	phone,
	measuring = false,
}: {
	order: EngineRecord<'orders'>;
	active: boolean;
	phone: boolean;
	/** Off stage, for its width only: no testIDs. */
	measuring?: boolean;
}) {
	const t = useT();
	return (
		// tabular-nums on the wrapper: on web it reaches the status label's amounts (waiting for
		// terminal, partly paid) so a tab does not change width as its numbers change.
		<View
			className={`tabular-nums ${phone ? 'flex-row items-center gap-1' : 'flex-col items-start gap-0'}`}
		>
			<CartTabTitle order={order} amountOnly active={active} />
			<TabChip
				order={order}
				active={active}
				compact={phone}
				fallbackLabel={t('pos_cart.tab_cart')}
				testIDs={!measuring}
			/>
		</View>
	);
}
function ReceiptTabContent({
	uuid,
	active,
	phone,
	measuring = false,
}: {
	uuid: string;
	active: boolean;
	phone: boolean;
	measuring?: boolean;
}) {
	const resource = useEngineRecord('orders', uuid);
	const record = useObservableSuspense(resource);
	// A receipt whose order is gone (store switch, purge) leaves the strip rather than
	// lingering as an empty tab; the store write is what removes the trigger above.
	React.useEffect(() => {
		if (!record) finishReceipt(uuid);
	}, [record, uuid]);
	if (!record) return null;
	return <TabContent order={record} active={active} phone={phone} measuring={measuring} />;
}
