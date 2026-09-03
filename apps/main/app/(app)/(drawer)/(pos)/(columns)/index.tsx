import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import '@wcpos/core/screens/main/pos/register-panel-entries';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Icon } from '@wcpos/components/icon';
import { Panel, PanelGroup, PanelResizeHandle } from '@wcpos/components/panels';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { useTheme } from '@wcpos/core/contexts/theme';
import { Slot } from '@wcpos/core/extensions/slots';
import { useUISettings } from '@wcpos/core/screens/main/contexts/ui-settings';
import { OpenOrders } from '@wcpos/core/screens/main/pos/cart';
import { POSProducts } from '@wcpos/core/screens/main/pos/products';
import { useDocField } from '@wcpos/query';

import type { ReadonlyView, SlotContracts } from '@wcpos/core/extensions/slots';

/**
 * The panel entry whose width the `pos-products` setting stores. The route owns that
 * setting, so it is the route — not the slot — that knows which entry the number belongs to.
 */
const PRODUCTS_ENTRY_ID = 'products';

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

/**
 *
 */
export default function ResizablePOSColumns() {
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const { screenSize } = useTheme();
	const { bottom } = useSafeAreaInsets();
	const segments: string[] = useSegments();

	// Which side the products panel sits on, for the wide layout below. Read through
	// `useDocField` because the settings dialog that writes it is rendered INSIDE the
	// products panel: this route stays mounted across the change, and a plain property read
	// off the RxState container would not re-render it. It is read here, above the
	// small-screen early return, because hooks may not sit behind a conditional.
	const position = useDocField(uiSettings, (value) => value.position);
	const productsOnRight = position === 'right';

	// Check if we're at a /cart route (with or without orderId)
	// If at cart route, default to cart tab; otherwise products tab
	const isAtCartRoute = segments.includes('cart');
	const [activeTab, setActiveTab] = React.useState<'products' | 'cart'>(
		isAtCartRoute ? 'cart' : 'products'
	);

	// When navigating onto a cart route, switch to the cart tab. We track the previous
	// route flag and adjust state during render (React's "adjusting state during render"
	// pattern) rather than in an effect, so the tab switch happens on the route
	// transition without an extra render pass. Navigating away from cart does not force
	// the products tab, matching the prior behaviour.
	const [wasAtCartRoute, setWasAtCartRoute] = React.useState(isAtCartRoute);
	if (isAtCartRoute !== wasAtCartRoute) {
		setWasAtCartRoute(isAtCartRoute);
		if (isAtCartRoute) {
			setActiveTab('cart');
		}
	}

	// On small screens, render a tab-like UI with Products and Cart tabs
	// This handles the case when user resizes from large to small screen
	if (screenSize === 'sm') {
		return (
			<View testID="screen-pos" style={{ flex: 1, paddingBottom: bottom }}>
				{/* Tab content. Both panes stay MOUNTED and toggle visibility: POSProducts
				    owns the barcode scan subscription, and the POS section owns scans
				    (#1438) — unmounting it on the Cart tab would drop every scan. */}
				<View style={{ flex: 1, display: activeTab === 'products' ? 'flex' : 'none' }}>
					<Suspense>
						<ErrorBoundary>
							<POSProducts />
						</ErrorBoundary>
					</Suspense>
				</View>
				<View style={{ flex: 1, display: activeTab === 'cart' ? 'flex' : 'none' }}>
					<Suspense>
						<ErrorBoundary>
							<OpenOrders />
						</ErrorBoundary>
					</Suspense>
				</View>
				{/* Tab bar */}
				<View className="border-border bg-card flex-row justify-around border-t py-2">
					<Pressable
						testID="pos-tab-products"
						onPress={() => setActiveTab('products')}
						className="flex-1 items-center gap-1 py-2"
					>
						<Icon name="gifts" variant={activeTab === 'products' ? 'primary' : 'muted'} />
						<Text
							className={
								activeTab === 'products' ? 'text-primary text-xs' : 'text-muted-foreground text-xs'
							}
						>
							Products
						</Text>
					</Pressable>
					<Pressable
						testID="pos-tab-cart"
						onPress={() => setActiveTab('cart')}
						className="flex-1 items-center gap-1 py-2"
					>
						<Icon name="cartShopping" variant={activeTab === 'cart' ? 'primary' : 'muted'} />
						<Text
							className={
								activeTab === 'cart' ? 'text-primary text-xs' : 'text-muted-foreground text-xs'
							}
						>
							Cart
						</Text>
					</Pressable>
				</View>
			</View>
		);
	}

	/**
	 * The wide layout IS the `pos.columns.panel` slot: the registry supplies the panels and
	 * their order, and this route only arranges them — reversing when the merchant put the
	 * products on the right — and owns the resize handles and the persisted width.
	 */
	return (
		<View testID="screen-pos" style={{ flex: 1, paddingBottom: bottom }}>
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
											descriptor.id === PRODUCTS_ENTRY_ID
												? uiSettings.width
												: 100 - uiSettings.width
										}
										minSize={25}
										id={descriptor.id}
									>
										{element}
									</Panel>
								</React.Fragment>
							))}
						</PanelGroup>
					);
				}}
			</Slot>
		</View>
	);
}
