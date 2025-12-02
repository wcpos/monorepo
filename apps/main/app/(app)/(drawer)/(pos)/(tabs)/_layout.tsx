import * as React from 'react';
import { View } from 'react-native';

import { Tabs, useGlobalSearchParams, usePathname, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Icon } from '@wcpos/components/icon';
import { Panel, PanelGroup, PanelResizeHandle } from '@wcpos/components/panels';
import { Suspense } from '@wcpos/components/suspense';
import { useTheme } from '@wcpos/core/contexts/theme';
import { useUISettings } from '@wcpos/core/screens/main/contexts/ui-settings';
import { OpenOrders } from '@wcpos/core/screens/main/pos/cart';
import { POSProducts } from '@wcpos/core/screens/main/pos/products';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function TabsLayout() {
	const { screenSize } = useTheme();
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const { bottom } = useSafeAreaInsets();
	const pathname = usePathname();
	const segments = useSegments();
	const params = useGlobalSearchParams();

	console.log('[Tabs Layout] ===================');
	console.log('[Tabs Layout] screenSize:', screenSize);
	console.log('[Tabs Layout] pathname:', pathname);
	console.log('[Tabs Layout] segments:', segments);
	console.log('[Tabs Layout] params:', params);

	// On larger screens, render columns layout (preserves orderId, no redirect needed)
	// This handles the case when user resizes from small to large screen
	if (screenSize !== 'sm') {
		console.log('[Tabs Layout] screenSize is NOT sm, rendering columns layout');
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

	console.log('[Tabs Layout] Rendering tabs layout');

	return (
		<Tabs screenOptions={{ headerShown: false }}>
			<Tabs.Screen
				name="index"
				options={{
					title: 'Products',
					tabBarIcon: ({ focused }) => (
						<Icon name="gifts" className={focused ? 'text-primary' : 'text-muted-foreground'} />
					),
				}}
			/>
			<Tabs.Screen
				name="cart"
				options={{
					title: 'Cart',
					tabBarIcon: ({ focused }) => (
						<Icon
							name="cartShopping"
							className={focused ? 'text-primary' : 'text-muted-foreground'}
						/>
					),
				}}
			/>
		</Tabs>
	);
}
