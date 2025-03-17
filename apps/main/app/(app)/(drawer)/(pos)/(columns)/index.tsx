import * as React from 'react';

import { useLocalSearchParams } from 'expo-router';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PanelGroup, Panel, PanelResizeHandle } from '@wcpos/components/panels';
import { Suspense } from '@wcpos/components/suspense';
import { useUISettings } from '@wcpos/core/screens/main/contexts/ui-settings';
import { OpenOrders } from '@wcpos/core/screens/main/pos/cart';
import { POSProducts } from '@wcpos/core/screens/main/pos/products';
/**
 *
 */
export default function ResizablePOSColumns() {
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	console.log('orderId', orderId);

	/**
	 *
	 */
	return (
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
	);
}
