import * as React from 'react';

import { loadRest } from '@wcpos/core/screens/main/rest/lazy';

const Screen = React.lazy(() => loadRest().then((m) => ({ default: m.OrdersScreen })));

export default function OrdersRoute() {
	return (
		<React.Suspense fallback={null}>
			<Screen />
		</React.Suspense>
	);
}
