import * as React from 'react';

import { withProAccess } from '@wcpos/core/screens/main/components/pro-guard';
import { lazyRest } from '@wcpos/core/screens/main/rest/lazy-screen';

const Screen = lazyRest((m) => m.AddCouponScreen);

function AddCouponRoute() {
	return (
		<React.Suspense fallback={null}>
			<Screen />
		</React.Suspense>
	);
}

export default withProAccess(AddCouponRoute, 'coupons');
