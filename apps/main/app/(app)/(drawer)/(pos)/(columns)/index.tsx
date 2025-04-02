import * as React from 'react';
import { View } from 'react-native';

import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PanelGroup, Panel, PanelResizeHandle } from '@wcpos/components/panels';
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

	if (screenSize === 'sm') {
		return <Redirect href="(tabs)" />;
	}

	/**
	 *
	 */
	return (
		<View style={{ flex: 1, paddingBottom: bottom }}>
			<PanelGroup onResize={({ width }) => patchUI({ width })}>
				<Panel defaultSize={uiSettings.width}>
					<Suspense>
						<ErrorBoundary>
							<POSProducts isColumn />
						</ErrorBoundary>
					</Suspense>
				</Panel>
				<PanelResizeHandle />
				<Panel>
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
