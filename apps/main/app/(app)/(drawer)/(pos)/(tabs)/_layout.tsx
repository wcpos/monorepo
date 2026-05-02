import * as React from 'react';
import { Platform, View } from 'react-native';

import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

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

/**
 * Tabs navigator wrapper consuming theme-aware colors via `useCSSVariable`.
 * Isolated so `TabsLayout` itself does not subscribe to theme changes
 * (which would re-render the entire navigator and cancel Uniwind's
 * theme transition).
 */
function ThemedTabs({ tabPressListener }: { tabPressListener: { tabPress: () => void } }) {
	const [cardColor, primaryColor, mutedForeground, borderColor] = useCSSVariable([
		'--color-card',
		'--color-primary',
		'--color-muted-foreground',
		'--color-border',
	]) as string[];

	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				sceneStyle: { backgroundColor: 'transparent' },
				tabBarStyle: { backgroundColor: cardColor, borderTopColor: borderColor },
				tabBarActiveTintColor: primaryColor,
				tabBarInactiveTintColor: mutedForeground,
			}}
		>
			<Tabs.Screen
				name="index"
				listeners={tabPressListener}
				options={{
					title: 'Products',
					tabBarIcon: ({ focused }) => (
						<Icon name="gifts" className={focused ? 'text-primary' : 'text-muted-foreground'} />
					),
				}}
			/>
			<Tabs.Screen
				name="cart"
				listeners={tabPressListener}
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

export default function TabsLayout() {
	const { screenSize } = useTheme();
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const { bottom } = useSafeAreaInsets();

	const tabPressListener = React.useMemo(
		() => ({
			tabPress: () => {
				if (Platform.OS !== 'web') {
					Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				}
			},
		}),
		[]
	);

	// On larger screens, render columns layout (preserves orderId, no redirect needed)
	// This handles the case when user resizes from small to large screen
	if (screenSize !== 'sm') {
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

	return (
		<View className="bg-background flex-1">
			<ThemedTabs tabPressListener={tabPressListener} />
		</View>
	);
}
