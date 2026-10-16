import * as React from 'react';

import { loadRest } from '@wcpos/core/screens/main/rest/lazy';

const Screen = React.lazy(() => loadRest().then((m) => ({ default: m.EditCouponScreen })));

export default function EditCouponRoute() {
	return (
		<React.Suspense fallback={null}>
			<Screen />
		</React.Suspense>
	);
}
