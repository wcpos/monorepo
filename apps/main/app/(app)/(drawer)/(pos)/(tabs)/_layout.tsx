import * as React from 'react';
import { View } from 'react-native';

import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsPhone } from '@wcpos/components/lib/device';
import { useT } from '@wcpos/core/contexts/translations';
import { POSColumns } from '@wcpos/core/screens/main/pos/columns';

import { POSNavigatorTabBar } from '../../../../../components/pos-phone-tab-bar';
import { useNavigationBackground } from '../../../../../components/use-navigation-background';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	anchor: 'index',
};

/**
 * Tabs navigator wrapper subscribing to the theme-aware background via `useNavigationBackground`.
 * Isolation here keeps the parent `TabsLayout` from subscribing to theme changes, re-rendering the
 * entire navigator, and canceling Uniwind's theme transition.
 */
function ThemedTabs() {
	const t = useT();
	const screenBackgroundColor = useNavigationBackground();
	return (
		<Tabs
			// The one phone tab bar, which the (columns) fallback draws too.
			tabBar={(props) => <POSNavigatorTabBar {...props} />}
			screenOptions={{
				headerShown: false,
				// Mount both tabs immediately: POSProducts owns the barcode scan
				// subscription and the POS section owns scans (#1438) — a lazy
				// products tab would leave a direct /cart entry with no scan handler.
				lazy: false,
				sceneStyle: { backgroundColor: screenBackgroundColor },
			}}
		>
			{/* The titles name the screen (the web document title); the bar draws its own labels. */}
			<Tabs.Screen name="index" options={{ title: t('common.products') }} />
			<Tabs.Screen name="cart" options={{ title: t('pos_cart.tab_cart') }} />
		</Tabs>
	);
}

export default function TabsLayout() {
	const phone = useIsPhone();
	const { top } = useSafeAreaInsets();

	// On larger screens, render columns layout (preserves orderId, no redirect needed)
	// This handles the case when user resizes from small to large screen
	if (!phone) {
		// The columns run edge to edge; each pads its own insets (EdgeColumn).
		return (
			<View testID="screen-pos" style={{ flex: 1 }}>
				<POSColumns />
			</View>
		);
	}

	// Both tab screens sit on `bg-background` at the top (the register bar has no fill of its
	// own), so the container pads the status bar in that same colour: no band. The tab bar pads
	// the home indicator inside its own card colour.
	return (
		<View testID="screen-pos" className="bg-background flex-1" style={{ paddingTop: top }}>
			<ThemedTabs />
		</View>
	);
}
