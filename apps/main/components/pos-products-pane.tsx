import * as React from 'react';
import { View } from 'react-native';

import { RegisterBar } from '@wcpos/core/screens/main/pos/cart/register-bar';
import { POSProducts } from '@wcpos/core/screens/main/pos/products/v2';

/**
 * Phone Products pane shared by the (tabs) Products tab and the (columns)
 * small-screen fallback so the two cannot drift (#2363).
 */
export function POSProductsPane({ children }: { children?: React.ReactNode }) {
	const [panelOpen, setPanelOpen] = React.useState(false);
	return (
		<View className="h-full" testID="pos-products-tab">
			{/* Phone: the bar (hamburger, place, avatar) lives on both tabs; Switch register is the cart tab's. */}
			<RegisterBar panelOpen={panelOpen} onPanelOpenChange={setPanelOpen} />
			{children}
			{/* POSProducts sizes itself h-full; give it a flex child to measure against so the bar keeps its row. */}
			<View className="min-h-0 flex-1">
				<POSProducts />
			</View>
		</View>
	);
}
