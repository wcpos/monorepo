import * as React from 'react';
import { Text } from 'react-native';

import {
	getCartAddTiming,
	isCartAddTimingEnabled,
	subscribeCartAddTiming,
} from '../hooks/cart-add-timing';

/** Machine-readable sample; only visible in explicitly instrumented E2E sessions. */
export function CartAddTimingReadout() {
	const sample = React.useSyncExternalStore(
		subscribeCartAddTiming,
		getCartAddTiming,
		getCartAddTiming
	);
	if (!isCartAddTimingEnabled()) return null;
	return (
		<Text testID="e2e-cart-add-timing" style={{ fontSize: 8 }}>
			{JSON.stringify(sample)}
		</Text>
	);
}
