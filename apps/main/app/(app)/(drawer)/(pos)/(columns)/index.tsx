import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Icon } from '@wcpos/components/icon';
import { Panel, PanelGroup, PanelResizeHandle } from '@wcpos/components/panels';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { useTheme } from '@wcpos/core/contexts/theme';
import { useUISettings } from '@wcpos/core/screens/main/contexts/ui-settings';
import { OpenOrders } from '@wcpos/core/screens/main/pos/cart';
import { POSProducts } from '@wcpos/core/screens/main/pos/products';

/**
 *
 */
export default function ResizablePOSColumns() {
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const { screenSize } = useTheme();
	const { bottom } = useSafeAreaInsets();
	const segments: string[] = useSegments();

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
	 *
	 */
	return (
		<View testID="screen-pos" style={{ flex: 1, paddingBottom: bottom }}>
			<PanelGroup
				onLayout={([productsWidth, cartWidth]) => patchUI({ width: productsWidth })}
				direction="horizontal"
			>
				<Panel defaultSize={uiSettings.width} minSize={25} id="products">
					<Suspense>
						<ErrorBoundary>
							<POSProducts isColumn />
						</ErrorBoundary>
					</Suspense>
				</Panel>
				<PanelResizeHandle />
				{/* The cart NEEDS its complementary defaultSize: before the group's
				    layout reaches each panel's animated style, panels render with
				    flexGrow = defaultSize ?? 1, so a sized products panel next to an
				    unsized cart renders 60:1 — a ~1.5% cart sliver. On slow emulators
				    (CI, software GPU) that pre-layout style can stick for the whole
				    session, which is how both Android nightlies lost the entire cart
				    column (run 33110203691). With both sides sized the fallback IS
				    the correct layout, so the race is harmless. */}
				<Panel defaultSize={100 - uiSettings.width} minSize={25} id="cart">
					<Suspense>
						<ErrorBoundary>
							<OpenOrders isColumn />
						</ErrorBoundary>
					</Suspense>
				</Panel>
			</PanelGroup>
		</View>
	);
}
