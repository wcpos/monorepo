import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';
import Animated, { LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { Badge } from '@wcpos/components/badge';
import { Icon } from '@wcpos/components/icon';
import { useIsPhone } from '@wcpos/components/lib/device';
import { CROSSFADE, EASE } from '@wcpos/components/lib/motion';
import { SlideOver } from '@wcpos/components/slide-over';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, OPEN_ORDER_STATUSES } from '@wcpos/query';
import { isPaidStatus } from '@wcpos/sync-core';
import { readLedger } from '@wcpos/order-math';
import { useEngineRecord } from '@wcpos/query/record-readers';

import { useT } from '../../../../contexts/translations';
import {
	finishReceipt,
	leaveCheckout,
	resolveStage,
	selectReceipt,
	useCheckoutMode,
} from '../checkout/checkout-mode';
import { useResumeTerminalLegsForOrders } from '../checkout/payments/server/use-resume-terminal-legs';
import { useCurrentOrder } from '../contexts/current-order';
import { CartTabTitle } from './tab-title';
import { OpenOrdersList } from './open-orders-list';
import { TabChip } from './tab-chip';
import { NEW_TAB_WIDTH, PLUS_WIDTH, TAB_MIN, tabWindow } from './tab-window';

// Every control in the strip is a full-height cell: the hover and the press fill the
// rectangle (Paul, 2026-10-09), never a round button inside it.
const CELL = 'web:hover:bg-muted active:bg-muted h-full items-center justify-center';
// A tab is as wide as its text (Paul, 2026-10-09): the same classes measure it and show it.
const TAB = 'h-full min-w-0 justify-center border-b-2 px-3';
// A step slides the row by the width of the tab that left it. The + cell's fold and unfold
// ride the same layout transition: the one place the strip animates a layout, not a
// transform (CODING_STANDARDS § Design 6; stated in #2460 and #2481).
const SHIFT = LinearTransition.duration(CROSSFADE).easing(EASE).reduceMotion(ReduceMotion.System);
// The DOM id the tablist owns the + cell by (web).
const NEW_TAB_ID = 'new-order-tab';

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
	const { checkoutOrders, receiptOrders, selectedReceiptOrder } = useCheckoutMode();
	const extraIds = [...new Set([...checkoutOrders, ...receiptOrders])].filter(
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
	// The blank cart is not an order until its first line, so it has no cart tab: the + cell
	// is its tab and unfolds into "+ New" while the cashier is on it (Paul, 2026-10-12).
	const fresh = activeValue === 'new';
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
	// Focus follows the open cart's tab: a step can take the focused tab off the row, and a
	// cart picked from the list has no tab until the window moves to it. The tab's ref
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
	// `measure` is the same content without its testIDs, for the off-stage measuring row:
	// a testID must point at one element.
	const entries: { id: string; content: React.ReactNode; measure: React.ReactNode }[] = [
		...openOrders.map(({ id, record }) => ({
			id,
			content: <TabContent order={record} active={id === activeValue} phone={phone} />,
			measure: <TabContent order={record} active={id === activeValue} phone={phone} measuring />,
		})),
		...extraIds.map((uuid) => ({
			id: uuid,
			content: (
				// Suspend receipt content only: one loading receipt must not hide the other tabs.
				<React.Suspense fallback={null}>
					<InFlightTabContent uuid={uuid} active={uuid === activeValue} phone={phone} />
				</React.Suspense>
			),
			measure: (
				<React.Suspense fallback={null}>
					<InFlightTabContent uuid={uuid} active={uuid === activeValue} phone={phone} measuring />
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
		focusPending.current = true;
		handleTabPress(at === entries.length ? 'new' : entries[at].id);
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
					// On the blank cart the row keeps the carts beside the New tab: the last ones.
					active: Math.min(activeIndex, entries.length - 1),
					plus: fresh ? NEW_TAB_WIDTH : PLUS_WIDTH,
					anchored: !fresh,
				})
			: { fits: true, start: 0, end: entries.length, tray: false, left: false, right: false };
	// Only carts that could reach the row are measured: the row holds at most this many
	// minimum-width tabs either side of the open one.
	const reach = Math.ceil((strip.width || 800) / TAB_MIN) + 1;
	const toMeasure = entries.slice(Math.max(activeIndex - reach, 0), activeIndex + reach + 1);
	// A sole tab has nothing to be selected against: no underline (board, "One cart"). The
	// unfolded New tab counts: with no carts it is the only tab.
	const solo = entries.length + (fresh ? 1 : 0) === 1;
	const renderTab = ({ id, content }: (typeof entries)[number]) => {
		const active = id === activeValue;
		return (
			<Animated.View key={id} layout={SHIFT} className="h-full">
				<Pressable
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
				// The arrow keys step from any tab, the + cell included: the handler sits on the
				// strip, the one ancestor of them all, and answers only a key struck on a tab (the
				// tray and the arrows are buttons with keys of their own).
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
						className={`${CELL} w-11`}
						testID="scrollable-tabs-prev"
						accessibilityLabel={t('pos_cart.previous_cart')}
						onPress={() => step(-1)}
					>
						<Icon name="chevronLeft" className="text-muted-foreground" />
					</Pressable>
				)}
				{/* The + cell sits after the right arrow, outside this view, but it is one of the
				    tabs: the tablist owns it so a reader finds the selected New tab among them. */}
				<View
					role="tablist"
					aria-owns={NEW_TAB_ID}
					className="min-w-0 flex-1 flex-row overflow-hidden"
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
						className={`${CELL} w-11`}
						testID="scrollable-tabs-next"
						accessibilityLabel={t('pos_cart.next_cart')}
						onPress={() => step(1)}
					>
						<Icon name="chevronRight" className="text-muted-foreground" />
					</Pressable>
				)}
				{/* The + cell is the blank cart's tab: folded it is the 48 pt + at the end of the
				    row; while the cashier is on the blank cart it unfolds (the same width motion as
				    a step) into the selected "+ New" tab, and folds back when they leave. Nothing
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
function InFlightTabContent({
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
	return <TabContent order={record} active={active} phone={phone} measuring={measuring} />;
}
