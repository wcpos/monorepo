import * as React from 'react';

import { withProAccess } from '@wcpos/core/screens/main/components/pro-guard';
import { loadRest } from '@wcpos/core/screens/main/rest/lazy';

const Screen = React.lazy(() => loadRest().then((m) => ({ default: m.AddCouponScreen })));

function AddCouponRoute() {
	return (
		<React.Suspense fallback={null}>
			<Screen />
		</React.Suspense>
	);
}

export default withProAccess(AddCouponRoute, 'coupons');
