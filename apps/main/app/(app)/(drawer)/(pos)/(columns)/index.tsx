import * as React from 'react';
import { View } from 'react-native';

import { useGlobalSearchParams, usePathname, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Panel, PanelGroup, PanelResizeHandle } from '@wcpos/components/panels';
import { Suspense } from '@wcpos/components/suspense';
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
	const pathname = usePathname();
	const segments = useSegments();
	const params = useGlobalSearchParams();

	console.log('[Columns] ===================');
	console.log('[Columns] screenSize:', screenSize);
	console.log('[Columns] pathname:', pathname);
	console.log('[Columns] segments:', segments);
	console.log('[Columns] params:', params);

	// On small screens, render just the cart view (preserves orderId, no redirect needed)
	// This handles the case when user resizes from large to small screen
	if (screenSize === 'sm') {
		console.log('[Columns] screenSize is sm, rendering cart-only view');
		return (
			<View style={{ flex: 1, paddingBottom: bottom }}>
				<Suspense>
					<ErrorBoundary>
						<OpenOrders />
					</ErrorBoundary>
				</Suspense>
			</View>
		);
	}

	console.log('[Columns] Rendering columns layout');

	/**
	 *
	 */
	return (
		<View style={{ flex: 1, paddingBottom: bottom }}>
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
				<Panel minSize={25} id="cart">
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
