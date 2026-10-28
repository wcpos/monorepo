import * as React from 'react';
import { Platform, Pressable, ScrollView, type ScrollViewInstance, View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';
import Animated, {
	LinearTransition,
	ReduceMotion,
	useReducedMotion,
} from 'react-native-reanimated';

import { Badge } from '@wcpos/components/badge';
import { Icon } from '@wcpos/components/icon';
import { useIsPhone } from '@wcpos/components/lib/device';
import { CROSSFADE, EASE } from '@wcpos/components/lib/motion';
import { SlideOver } from '@wcpos/components/slide-over';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, OPEN_ORDER_STATUSES, useRecordField } from '@wcpos/query';
import { isPaidStatus } from '@wcpos/sync-core';
import { readLedger } from '@wcpos/order-math';
import { useEngineRecord } from '@wcpos/query/record-readers';

import { useT } from '../../../../contexts/translations';
import {
	finishReceipt,
	getCheckoutModeSnapshot,
	leaveCheckout,
	resolveStage,
	selectReceipt,
	useCheckoutMode,
} from '../checkout/checkout-mode';
import { useResumeTerminalLegsForOrders } from '../checkout/payments/server/use-resume-terminal-legs';
import { useCurrentOrder } from '../contexts/current-order';
import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';
import { useNowMs, useRelativeTime } from '../../../../hooks/use-relative-time';
import { cartRestartsOnAdd } from '../hooks/cart-restart';
import { AGE_TICK_MS, OpenOrdersList, STALE_AFTER_MS } from './open-orders-list';
import { TabChip } from './tab-chip';
import { trayExceptions } from './tray-exceptions';
import { useAwaitingStore } from '../checkout/use-awaiting-store';
import {
	centredOffset,
	NEW_TAB_WIDTH,
	PLUS_WIDTH,
	ROW_REACH,
	rowOverflows,
	snapOffsets,
	TAB_MIN,
	tabOffsets,
} from './tab-window';
import { tabWho } from './tab-who';

// Every control in the strip is a full-height cell: the hover and the press fill the
// rectangle (Paul, 2026-10-09), never a round button inside it.
const CELL = 'web:hover:bg-muted active:bg-muted h-full items-center justify-center';
// A tab is as wide as its text (Paul, 2026-10-09), clipped at the scroll edges.
const TAB = 'h-full min-w-0 justify-center border-b-2 px-3';
// The + cell keeps its fold/unfold layout transition (Paul, 2026-10-12).
const SHIFT = LinearTransition.duration(CROSSFADE).easing(EASE).reduceMotion(ReduceMotion.System);
// The DOM id the tablist owns the + cell by (web).
const NEW_TAB_ID = 'new-order-tab';
// RN-web emits its final scroll tick after 100 ms; let that tick land before releasing ours.
const SCROLL_IDLE_MS = 150;

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
	const nowMs = useNowMs(AGE_TICK_MS);
	const reducedMotion = useReducedMotion();
	const { checkoutOrders, receiptOrders, saveStates, selectedReceiptOrder } = useCheckoutMode();
	const awaiting = useAwaitingStore();
	const dragged = React.useRef(false);
	// Receipts and in-flight checkouts that left the open hits keep a tab. A draft that entered
	// checkout before its first save landed has no record yet and is no tab.
	const extraIds = [...new Set([...checkoutOrders, ...receiptOrders])].filter(
		(uuid) =>
			!openOrders.some((order) => order.id === uuid) && saveStates.get(uuid)?.kind !== 'saving'
	);
	// A tender belongs to the scope it was opened in: another cashier's or register's open
	// orders are not this till's, so a change of scope ends every unconfirmed checkout (a
	// confirmed receipt keeps its tab). Never on mount: coming back from the Orders screen
	// must not drop a sale mid-checkout.
	const seenScope = React.useRef(openOrdersScope);
	React.useEffect(() => {
		if (seenScope.current === openOrdersScope) return;
		seenScope.current = openOrdersScope;
		const mode = getCheckoutModeSnapshot();
		for (const uuid of mode.checkoutOrders) if (!mode.receiptOrders.has(uuid)) leaveCheckout(uuid);
	}, [openOrdersScope]);
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
	// The blank cart is not an order until its first line, so it has no cart tab: the + cell
	// is its tab and unfolds into "+ New" while the cashier is on it (Paul, 2026-10-12).
	const fresh = activeValue === 'new';
	const handleTabPress = React.useCallback(
		(orderId: string) => {
			// Every tab outside the open hits is a receipt (a paid checkout member renders only at
			// receipt stage), confirmed or not: selecting it as a cart would show the draft.
			if (receiptOrders.has(orderId) || extraIds.includes(orderId)) {
				selectReceipt(orderId);
				return;
			}
			selectReceipt(null);
			setCurrentOrderID(orderId === 'new' ? '' : orderId);
		},
		[setCurrentOrderID, receiptOrders, extraIds]
	);
	// Focus follows the open cart's tab: a step can take the focused tab off the row, and a
	// cart picked from the list may be beyond the mounted reach. The tab's ref
	// settles the focus once it is on the row.
	const focusPending = React.useRef(false);
	const focusTab = (node: unknown) =>
		(node as { focus?: (options?: FocusOptions) => void } | undefined)?.focus?.({
			preventScroll: true,
		});
	const closeList = (id = activeValue) => {
		setListOpen(false);
		const tab = tabs.current.get(id);
		if (tab) focusTab(tab);
		else focusPending.current = true;
	};
	// Every tab in strip order: open orders, then receipts of orders that have left the open
	// list. The blank cart is the + cell after them.
	const entries = [
		...openOrders.map(({ id, record }) => ({
			id,
			content: (
				<TabContent order={record} active={id === activeValue} phone={phone} nowMs={nowMs} />
			),
		})),
		...extraIds.map((uuid) => ({
			id: uuid,
			content: (
				// Suspend receipt content only: one loading receipt must not hide the other tabs.
				<React.Suspense fallback={null}>
					<InFlightTabContent
						uuid={uuid}
						active={uuid === activeValue}
						phone={phone}
						nowMs={nowMs}
					/>
				</React.Suspense>
			),
		})),
	];
	// On the blank cart the open position is just past the last tab: a step left lands on
	// the last cart, and a step right from the last cart lands on the blank one.
	const activeIndex = fresh
		? entries.length
		: Math.max(
				entries.findIndex(({ id }) => id === activeValue),
				0
			);
	const step = (delta: number) => {
		const at = activeIndex + delta;
		if (at < 0 || at > entries.length) return;
		dragged.current = false;
		focusPending.current = true;
		handleTabPress(at === entries.length ? 'new' : entries[at].id);
	};
	const anchor = Math.min(activeIndex, openOrders.length);
	const mounted = entries.filter(
		({ id }, index) =>
			(index >= anchor - ROW_REACH && index <= anchor + ROW_REACH) ||
			receiptOrders.has(id) ||
			index >= openOrders.length
	);
	const exceptions = trayExceptions({ orders: openOrders, activeValue, saveStates, awaiting });
	const exceptionTones = (['warning', 'error'] as const).filter((tone) => exceptions.has(tone));
	const scrollRef = React.useRef<ScrollViewInstance>(null);
	const [rowWidth, setRowWidth] = React.useState(0);
	const [contentWidth, setContentWidth] = React.useState(0);
	const [widths, setWidths] = React.useState<ReadonlyMap<string, number>>(() => new Map());
	const positions = tabOffsets(
		mounted.map(({ id }) => id),
		widths
	);
	// RN-web has no drag/end callbacks: distinguish our scroll ticks until scrolling goes quiet.
	const programmatic = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const endProgrammatic = React.useCallback(() => {
		clearTimeout(programmatic.current);
		programmatic.current = undefined;
	}, []);
	const trackProgrammatic = React.useCallback(() => {
		clearTimeout(programmatic.current);
		programmatic.current = setTimeout(endProgrammatic, SCROLL_IDLE_MS);
	}, [endProgrammatic]);
	// Release the outstanding scroll timer when the strip leaves the screen.
	React.useEffect(() => endProgrammatic, [endProgrammatic]);
	const overflow = rowOverflows({
		stripWidth: strip.width,
		plusWidth: fresh ? NEW_TAB_WIDTH : PLUS_WIDTH,
		contentWidth,
	});
	const activePosition = positions.get(activeValue);
	// The first centring is the strip finding its place on mount, not a move the cashier made:
	// it lands without a slide. Every later one slides (motion ruling: buttery, never a jump).
	const settled = React.useRef(false);
	const previousActive = React.useRef(activeValue);
	const offset = fresh
		? Math.max(0, contentWidth - rowWidth)
		: activePosition &&
			centredOffset({
				rowWidth,
				contentWidth,
				tabX: activePosition.x,
				tabWidth: activePosition.width,
			});
	// External selection and layout jointly drive the scroll, unless the cashier swiped away.
	React.useEffect(() => {
		if (previousActive.current !== activeValue) dragged.current = false;
		previousActive.current = activeValue;
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- External selection and layout events jointly drive this imperative scroll.
		if (dragged.current || !overflow || rowWidth <= 0 || offset === undefined) return;
		trackProgrammatic();
		scrollRef.current?.scrollTo({ x: offset, animated: settled.current && !reducedMotion });
		settled.current = true;
	}, [activeValue, offset, contentWidth, rowWidth, overflow, reducedMotion, trackProgrammatic]);
	// A sole tab has nothing to be selected against: no underline (board, "One cart"). The
	// unfolded New tab counts: with no carts it is the only tab.
	const solo = entries.length + (fresh ? 1 : 0) === 1;
	const renderTab = ({ id, content }: (typeof entries)[number]) => {
		const active = id === activeValue;
		return (
			<Pressable
				key={id}
				testID={`open-order-tab-${id}`}
				role="tab"
				aria-selected={active}
				ref={(node) => {
					if (!node) {
						tabs.current.delete(id);
						return;
					}
					tabs.current.set(id, node);
					if (active && focusPending.current) {
						focusPending.current = false;
						focusTab(node);
					}
				}}
				onPress={() => {
					handleTabPress(id);
					setListOpen(false);
				}}
				onLayout={({
					nativeEvent: {
						layout: { width },
					},
				}) => {
					setWidths((was) => {
						if (was.get(id) === width) return was;
						const live = new Set(mounted.map((entry) => entry.id));
						return new Map([...was].filter(([key]) => live.has(key))).set(id, width);
					});
				}}
				style={{ minWidth: TAB_MIN, flexShrink: 0 }}
				className={`${TAB} web:hover:bg-muted active:bg-muted ${active && !solo ? 'border-primary' : 'border-transparent'}`}
			>
				{content}
			</Pressable>
		);
	};
	return (
		<>
			<View
				testID="open-order-strip"
				className="bg-card border-border h-13 flex-row items-stretch border-t"
				// The arrow keys step from any tab, the + cell included: the handler sits on the
				// strip, the one ancestor of them all, and answers only a key struck on a tab (the
				// tray is a button with keys of its own).
				onKeyDown={
					Platform.OS === 'web'
						? (event) => {
								const key = event.nativeEvent.key;
								const from = (
									event.target as { getAttribute?: (n: string) => string | null }
								)?.getAttribute?.('role');
								if (
									from === 'tab' &&
									(key === 'ArrowLeft' || key === 'ArrowRight') &&
									!event.defaultPrevented
								) {
									event.preventDefault();
									step(key === 'ArrowLeft' ? -1 : 1);
								}
							}
						: undefined
				}
				onLayout={({ nativeEvent: { layout } }) => {
					setStrip((was) =>
						was.y === layout.y && was.height === layout.height && was.width === layout.width
							? was
							: { y: layout.y, height: layout.height, width: layout.width }
					);
				}}
			>
				{overflow && (
					<Pressable
						role="button"
						className={`${CELL} border-border min-w-14 flex-row gap-1 border-r px-2.5 ${listOpen ? 'bg-muted' : ''}`}
						testID="open-orders-count"
						accessibilityLabel={[
							t('pos_cart.open_orders_count', { count: openOrders.length }),
							...exceptionTones.map((tone) =>
								tone === 'error'
									? t('pos_checkout.chip_save_refused')
									: t('pos_checkout.awaiting_store')
							),
						].join(', ')}
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
						{exceptionTones.map((tone) => (
							<View
								key={tone}
								testID={`open-orders-${tone}`}
								className={`size-2 rounded-full ${tone === 'warning' ? 'bg-warning' : 'bg-destructive'}`}
								aria-hidden
							/>
						))}
						{/* The chevron points the way the list will travel. */}
						<Icon
							name={listOpen === (position === 'bottom') ? 'chevronDown' : 'chevronUp'}
							size="sm"
							className="text-muted-foreground"
						/>
					</Pressable>
				)}
				{/* The + cell lives outside the scroller, but remains one of its tabs. */}
				<ScrollView
					ref={scrollRef}
					horizontal
					// A tab press must reach its handler while the product-search keyboard is open.
					keyboardShouldPersistTaps="handled"
					showsHorizontalScrollIndicator={false}
					scrollEnabled={overflow}
					role="tablist"
					aria-owns={NEW_TAB_ID}
					className="min-w-0 flex-1"
					onLayout={({ nativeEvent: { layout } }) => setRowWidth(layout.width)}
					onContentSizeChange={(width) => setContentWidth(width)}
					onScrollBeginDrag={() => {
						dragged.current = true;
					}}
					onScroll={() => {
						if (Platform.OS !== 'web') return;
						if (programmatic.current !== undefined) trackProgrammatic();
						else dragged.current = true;
					}}
					scrollEventThrottle={16}
					onMomentumScrollEnd={endProgrammatic}
					// Native swipes snap to tab centres; RN-web ignores snapping, intentionally.
					snapToOffsets={snapOffsets({
						rowWidth,
						contentWidth,
						tabs: mounted.flatMap(({ id }) => {
							const position = positions.get(id);
							return position ? [position] : [];
						}),
					})}
					decelerationRate="fast"
				>
					{mounted.map(renderTab)}
				</ScrollView>
				{/* The + cell is the blank cart's tab: folded it is the 48 pt + at the end of the
				    row; while the cashier is on the blank cart it unfolds into the selected "+ New" tab, and folds back when they leave. Nothing
				    is added to or removed from the row. */}
				<Animated.View layout={SHIFT} className="h-full">
					<Pressable
						role="tab"
						nativeID={NEW_TAB_ID}
						aria-selected={fresh}
						style={{ width: fresh ? NEW_TAB_WIDTH : PLUS_WIDTH }}
						className={`${CELL} ${fresh ? `flex-row gap-1.5 border-b-2 ${solo ? 'border-transparent' : 'border-primary'}` : ''}`}
						testID="new-order-tab"
						accessibilityLabel={t('pos_cart.new_order')}
						ref={(node) => {
							if (!node) {
								tabs.current.delete('new');
								return;
							}
							tabs.current.set('new', node);
							// A step onto the blank cart settles its focus here, as a cart tab's does.
							if (fresh && focusPending.current) {
								focusPending.current = false;
								focusTab(node);
							}
						}}
						onPress={() => {
							// Already there: + is a place, not an action.
							if (!fresh) handleTabPress('new');
							// The strip stays pressable beside the open list: the blank cart must not
							// be left covered by it.
							setListOpen(false);
						}}
					>
						<Icon name="plus" className={fresh ? 'text-primary' : undefined} />
						{fresh && (
							<Text testID="new-order-tab-label" className="font-semibold">
								{t('pos_cart.new_cart_tab')}
							</Text>
						)}
					</Pressable>
				</Animated.View>
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
	nowMs,
}: {
	order: EngineRecord<'orders'>;
	active: boolean;
	phone: boolean;
	nowMs: number;
}) {
	const t = useT();
	const payload = useRecordField(order, (record) => record.payload);
	const relative = useRelativeTime();
	const openedMs = payload.date_created_gmt
		? convertUTCStringToLocalDate(payload.date_created_gmt).getTime()
		: undefined;
	const stale = openedMs !== undefined && nowMs - openedMs >= STALE_AFTER_MS;
	const age =
		openedMs !== undefined && !cartRestartsOnAdd(payload) ? (
			<Text
				variant="key"
				testID={`open-order-tab-${order.uuid}-age`}
				className={stale ? 'text-warn-text font-semibold' : 'text-muted-foreground'}
			>
				{relative(openedMs, nowMs)}
			</Text>
		) : null;
	return (
		// tabular-nums on the wrapper: on web it reaches the status label's amounts (waiting for
		// terminal, partly paid) so a tab does not change width as its numbers change.
		<View
			className={`tabular-nums ${phone ? 'flex-row items-center gap-1' : 'flex-col items-start gap-0'}`}
		>
			<Text
				testID={`open-order-tab-${order.uuid}-who`}
				numberOfLines={1}
				className={`max-w-52 ${active ? 'text-foreground font-semibold' : 'text-muted-foreground font-medium'}`}
			>
				{tabWho(payload, t)}
			</Text>
			<TabChip order={order} active={active} compact={phone} fallback={age} />
		</View>
	);
}
function InFlightTabContent({
	uuid,
	active,
	phone,
	nowMs,
}: {
	uuid: string;
	active: boolean;
	phone: boolean;
	nowMs: number;
}) {
	const mode = useCheckoutMode();
	const resource = useEngineRecord('orders', uuid);
	const record = useObservableSuspense(resource);
	// A receipt whose order is gone (store switch, purge) leaves the strip rather than
	// lingering as an empty tab; the store write is what removes the trigger above.
	React.useEffect(() => {
		if (!record) finishReceipt(uuid);
	}, [record, uuid]);
	// A checkout member definitively closed unpaid is no sale of this till's; remove its tab.
	React.useEffect(() => {
		const status = record?.payload.status;
		if (record && !OPEN_ORDER_STATUSES.includes(status as never) && !isPaidStatus(status)) {
			leaveCheckout(uuid);
		}
	}, [record, uuid, record?.payload.status]);
	const rows = readLedger(record?.payload.meta_data);
	if (!record || resolveStage(uuid, mode, rows, record.payload.status) !== 'receipt') return null;
	return <TabContent order={record} active={active} phone={phone} nowMs={nowMs} />;
}
