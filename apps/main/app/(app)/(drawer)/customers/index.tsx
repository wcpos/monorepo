import * as React from 'react';

import { loadRest } from '@wcpos/core/screens/main/rest/lazy';

const Screen = React.lazy(() => loadRest().then((m) => ({ default: m.CustomersScreen })));

export default function CustomersRoute() {
	return (
		<React.Suspense fallback={null}>
			<Screen />
		</React.Suspense>
	);
}
