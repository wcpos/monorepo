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
	const segments = useSegments();

	// Check if we're at a /cart route (with or without orderId)
	// If at cart route, default to cart tab; otherwise products tab
	const isAtCartRoute = segments.includes('cart');
	const [activeTab, setActiveTab] = React.useState<'products' | 'cart'>(
		isAtCartRoute ? 'cart' : 'products'
	);

	// When navigating to/from cart route, switch tabs accordingly
	React.useEffect(() => {
		if (isAtCartRoute) {
			setActiveTab('cart');
		}
	}, [isAtCartRoute]);

	// On small screens, render a tab-like UI with Products and Cart tabs
	// This handles the case when user resizes from large to small screen
	if (screenSize === 'sm') {
		return (
			<View style={{ flex: 1, paddingBottom: bottom }}>
				{/* Tab content */}
				<View style={{ flex: 1 }}>
					{activeTab === 'products' ? (
						<Suspense>
							<ErrorBoundary>
								<POSProducts />
							</ErrorBoundary>
						</Suspense>
					) : (
						<Suspense>
							<ErrorBoundary>
								<OpenOrders />
							</ErrorBoundary>
						</Suspense>
					)}
				</View>
				{/* Tab bar */}
				<View className="border-border bg-card flex-row justify-around border-t py-2">
					<Pressable
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
