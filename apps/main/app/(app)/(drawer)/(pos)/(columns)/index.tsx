import * as React from 'react';
import { View } from 'react-native';

import { ObserveInteractiveMarker } from 'expo-observe';
import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsPhone } from '@wcpos/components/lib/device';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { FallbackScreen } from '@wcpos/components/error-boundary/fallback-screen';
import { Suspense } from '@wcpos/components/suspense';
import { POSColumns } from '@wcpos/core/screens/main/pos/columns';
import { OpenOrders } from '@wcpos/core/screens/main/pos/cart';

import { POSPhoneTabBar } from '../../../../../components/pos-phone-tab-bar';
import { POSProductsPane } from '../../../../../components/pos-products-pane';

/**
 *
 */
export default function ResizablePOSColumns() {
	const phone = useIsPhone();
	const { top } = useSafeAreaInsets();
	const segments: string[] = useSegments();

	// Check if we're at a /cart route (with or without orderId)
	// If at cart route, default to cart tab; otherwise products tab
	const isAtCartRoute = segments.includes('cart');
	const isInPOSRoute = segments.includes('(pos)');
	const [activeTab, setActiveTab] = React.useState<'products' | 'cart'>(
		isAtCartRoute ? 'cart' : 'products'
	);

	// Track cart transitions only inside POS: a drawer round trip leaves (pos),
	// and returning must keep the tab the cashier left.
	const [wasAtCartRoute, setWasAtCartRoute] = React.useState(isAtCartRoute);
	if (isInPOSRoute && isAtCartRoute !== wasAtCartRoute) {
		setWasAtCartRoute(isAtCartRoute);
		if (isAtCartRoute) {
			setActiveTab('cart');
		}
	}

	// On small screens, render a tab-like UI with Products and Cart tabs
	// This handles the case when user resizes from large to small screen
	// Every surface that touches a screen edge pads its own inset inside its own background
	// (EdgeColumn, pos/columns/LEDGER.md line 6): here both tabs sit on `bg-background` at the
	// top, so the container pads the status bar in that colour, and the tab bar pads the home
	// indicator in its card colour.
	if (phone) {
		return (
			<View testID="screen-pos" className="bg-background flex-1" style={{ paddingTop: top }}>
				{/* Tab content. Both panes stay MOUNTED and toggle visibility: POSProducts
				    owns the barcode scan subscription, and the POS section owns scans
				    (#1438) — unmounting it on the Cart tab would drop every scan. */}
				<View style={{ flex: 1, display: activeTab === 'products' ? 'flex' : 'none' }}>
					<Suspense>
						{/* The whole Products tab, as in (tabs): a throw replaces it with the gate. The Cart
						    tab below keeps the inline bar, as (tabs)/cart does. */}
						<ErrorBoundary FallbackComponent={FallbackScreen}>
							{/* A resize or phone-width reload of /cart reaches this fallback; keep the same register bar as (tabs). */}
							<POSProductsPane>
								{activeTab === 'products' && <ObserveInteractiveMarker />}
							</POSProductsPane>
						</ErrorBoundary>
					</Suspense>
				</View>
				<View style={{ flex: 1, display: activeTab === 'cart' ? 'flex' : 'none' }}>
					<Suspense>
						<ErrorBoundary>
							<OpenOrders />
							{activeTab === 'cart' && <ObserveInteractiveMarker />}
						</ErrorBoundary>
					</Suspense>
				</View>
				{/* The same tab bar the (tabs) navigator draws. */}
				<POSPhoneTabBar active={activeTab} onSelect={setActiveTab} />
			</View>
		);
	}

	// The columns run edge to edge; each pads its own insets (EdgeColumn).
	return (
		<View testID="screen-pos" style={{ flex: 1 }}>
			<POSColumns />
			{/* The logged-in entry screen: time-to-interactive is the till's mount, the
			    moment after hydration the cashier first sees the register (lib/observe.ts). */}
			<ObserveInteractiveMarker />
		</View>
	);
}
