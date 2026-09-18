import * as React from 'react';

import { ObserveInteractiveMarker } from 'expo-observe';

import { Connect } from '@wcpos/core/screens/auth/connect';

/**
 * The logged-out entry screen. Every screen a launch can land on marks itself
 * interactive, or a launch that lands here records no time-to-interactive at
 * all (see lib/observe.ts).
 */
export default function ConnectScreen() {
	return (
		<>
			<Connect />
			<ObserveInteractiveMarker />
		</>
	);
}
