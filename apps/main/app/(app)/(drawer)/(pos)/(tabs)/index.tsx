import * as React from 'react';
import { View } from 'react-native';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { RegisterBar } from '@wcpos/core/screens/main/pos/cart/register-bar';
import { POSProducts } from '@wcpos/core/screens/main/pos/products';

export default function POSProductsTab() {
	const [panelOpen, setPanelOpen] = React.useState(false);
	return (
		<ErrorBoundary>
			<Suspense>
				{/* Phone: the bar (hamburger, place, avatar) lives on both tabs; Switch register is the cart tab's. */}
				<View className="h-full" testID="pos-products-tab">
					<RegisterBar panelOpen={panelOpen} onPanelOpenChange={setPanelOpen} />
					{/* POSProducts sizes itself h-full; give it a flex child to measure against so the bar keeps its row. */}
					<View className="min-h-0 flex-1">
						<POSProducts />
					</View>
				</View>
			</Suspense>
		</ErrorBoundary>
	);
}
