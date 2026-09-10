import * as React from 'react';
import { Text } from 'react-native';

import { commitCartAddTiming, getCartAddTiming, subscribeCartAddTiming } from './cart-add-timing';

/** Machine-readable sample; only visible in explicitly instrumented E2E sessions. */
export function CartAddTimingReadout() {
	const sample = React.useSyncExternalStore(
		subscribeCartAddTiming,
		getCartAddTiming,
		getCartAddTiming
	);
	return (
		<Text testID="e2e-cart-add-timing" style={{ fontSize: 8 }}>
			{JSON.stringify(sample)}
		</Text>
	);
}

export function CartAddTimingCommit({
	orderId,
	lines,
}: {
	orderId: string;
	lines: Parameters<typeof commitCartAddTiming>[1];
}) {
	React.useLayoutEffect(() => {
		// Observe the table commit, including the first add that mounts it from a draft.
		commitCartAddTiming(orderId, lines);
	}, [orderId, lines]);
	return null;
}
