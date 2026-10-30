import * as React from 'react';
import { Platform } from 'react-native';

import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { EdgeSurface } from '@wcpos/components/edge-surface';
import { FlashSurface } from '@wcpos/components/flash-surface';
import { useThemeTraits } from '@wcpos/components/lib/theme-traits';
import { GroundInnerEdge } from '@wcpos/components/lib/ground';
import { CROSSFADE, ROLL_IN, TEAR_OFF } from '@wcpos/components/lib/motion';
import { Panel, PanelGroup, PanelResizeHandle } from '@wcpos/components/panels';
import { type EngineRecord, useDocField } from '@wcpos/query';

import '../register-panel-entries';
import { Slot } from '../../../../extensions/slots';
import { useUISettings } from '../../contexts/ui-settings';
import { useCurrentOrder } from '../contexts/current-order';
import { useCheckoutMode, useOrderCheckoutStage } from '../checkout/checkout-mode';
import { ReceiptStage } from '../checkout/receipt-stage/receipt-stage';
import { CheckoutColumn } from '../checkout/column/checkout-column';

import type { ReadonlyView, SlotContracts } from '../../../../extensions/slots';

const PRODUCTS_ENTRY_ID = 'products';

/** A register column runs from the top screen edge to the bottom one. */
const COLUMN = ['top', 'bottom'] as const;

/** This slot grants no host methods: the panels are pure layout. */
const NO_API: SlotContracts['pos.columns.panel']['api'] = {};

/**
 * A panel's side is fixed for as long as it is mounted, so these views never notify.
 * They are module constants because `useSlotValue` needs a stable snapshot.
 */
const NEVER_CHANGES = () => () => {};
const PANEL_VIEWS: Record<
	'left' | 'right',
	ReadonlyView<SlotContracts['pos.columns.panel']['value']>
> = {
	left: { value: { side: 'left', isColumn: true }, subscribe: NEVER_CHANGES },
	right: { value: { side: 'right', isColumn: true }, subscribe: NEVER_CHANGES },
};

// A panel that lets its content's focus ring paint past its edge (see the products Panel).
const RING_ROOM = { overflow: 'visible' as const };

export function POSColumns() {
	const { tear } = useThemeTraits();
	const { currentOrderRecord } = useCurrentOrder();
	const { selectedReceiptOrder } = useCheckoutMode();
	const stage = useOrderCheckoutStage(currentOrderRecord);
	const { uiSettings: cartSettings } = useUISettings('pos-cart');
	const receiptUuid =
		selectedReceiptOrder ??
		(stage === 'receipt' && cartSettings.autoShowReceipt ? currentOrderRecord.uuid : null);
	const showTender = stage === 'checkout' || stage === 'receipt';
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const position = useDocField(cartSettings, (value) => value.position);
	const productsOnRight = position === 'left';

	const panels = (
		<Slot
			id="pos.columns.panel"
			api={NO_API}
			data={(_entry, index, total) =>
				PANEL_VIEWS[(productsOnRight ? total - 1 - index : index) === 0 ? 'left' : 'right']
			}
		>
			{(entries) => {
				const ordered = productsOnRight ? [...entries].reverse() : entries;
				const productsIndex = ordered.findIndex(
					({ descriptor }) => descriptor.id === PRODUCTS_ENTRY_ID
				);
				return (
					<PanelGroup
						onLayoutChanged={(layout, { isUserInteraction }) => {
							const productsWidth = layout[productsIndex];
							if (isUserInteraction && productsWidth !== undefined) {
								void patchUI({ width: productsWidth });
							}
						}}
						direction="horizontal"
					>
						{ordered.map(({ descriptor, element }, index) => (
							<React.Fragment key={descriptor.id}>
								{index > 0 ? <PanelResizeHandle testID="pos-resize-handle" /> : null}
								{/* BOTH panels stay sized: before the group's layout reaches each panel's
							    animated style, panels render with flexGrow = defaultSize ?? 1, so a sized
							    products panel next to an unsized cart renders 60:1 — a ~1.5% cart sliver.
							    On slow emulators (CI, software GPU) that pre-layout style can stick for
							    the whole session, which is how both Android nightlies lost the entire
							    cart column (run 33110203691). With both sides sized the fallback IS the
							    correct layout, so the race is harmless. */}
								<Panel
									testID={`pos-${descriptor.id}-panel`}
									defaultSize={
										descriptor.id === PRODUCTS_ENTRY_ID ? uiSettings.width : 100 - uiSettings.width
									}
									minSize={25}
									id={descriptor.id}
									// The products panel does not clip on the web: its edge facing the cart
									// keeps no inset (ledger line 8), so the search field and the chips sit
									// flush with the panel, and a focus ring there (the field's 1 px, a chip's
									// outline) draws into the gutter the handle owns; the primitive hides
									// overflow by default and cut the ring off on that side (owner, 2026-10-29).
									// The pane's own surfaces (stacks, lists, scrollers) clip themselves.
									style={
										descriptor.id === PRODUCTS_ENTRY_ID && Platform.OS === 'web'
											? RING_ROOM
											: undefined
									}
								>
									{/* Each panel's content is a column touching the top and bottom edges in the
									    colour that content paints, so it runs through both safe-area insets and the
									    resize handle runs the full screen height (ledger line 6). */}
									{descriptor.id === PRODUCTS_ENTRY_ID ? (
										<Animated.View
											key={
												receiptUuid ? `receipt:${receiptUuid}` : showTender ? 'checkout' : 'cart'
											}
											entering={tear ? ROLL_IN : FadeIn.duration(CROSSFADE)}
											exiting={tear ? TEAR_OFF : FadeOut.duration(CROSSFADE)}
											style={{ flex: 1, transformOrigin: 'top center' }}
										>
											{receiptUuid ? (
												<FlashSurface
													testID="pos-receipt-column"
													edges={COLUMN}
													className="bg-card flex-1"
												>
													<ReceiptStage orderUuid={receiptUuid} compact={false} />
												</FlashSurface>
											) : showTender ? (
												<EdgeSurface
													testID="pos-checkout-column"
													edges={COLUMN}
													className="bg-card flex-1"
												>
													{/* Keyed by order: two orders in checkout must not share one keypad reducer. */}
													<CheckoutColumn
														key={currentOrderRecord.uuid}
														order={currentOrderRecord as EngineRecord<'orders'>}
													/>
												</EdgeSurface>
											) : (
												// The products column's edge facing the cart keeps no inset: the handle
												// placed above IS the gutter (lib/ground; ledger line 8). Named here, beside
												// the handle, so the two halves of that rule live in one file.
												<GroundInnerEdge value={productsOnRight ? 'left' : 'right'}>
													<EdgeSurface
														testID="pos-products-column"
														edges={COLUMN}
														className="bg-background flex-1"
													>
														{element}
													</EdgeSurface>
												</GroundInnerEdge>
											)}
										</Animated.View>
									) : (
										// The cart (and any other panel) paints the card colour (`OpenOrders` in
										// its column is `bg-card`).
										<EdgeSurface
											testID={`pos-${descriptor.id}-column`}
											edges={COLUMN}
											className="bg-card flex-1"
										>
											{element}
										</EdgeSurface>
									)}
								</Panel>
							</React.Fragment>
						))}
					</PanelGroup>
				);
			}}
		</Slot>
	);
	return panels;
}
