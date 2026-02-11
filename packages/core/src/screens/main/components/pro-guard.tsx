import * as React from 'react';

import { useLicense } from '../hooks/use-license';
import { PageUpgrade } from '../page-upgrade';

type ProPage = 'products' | 'orders' | 'customers' | 'reports';

/**
 * Higher-order component that wraps a screen to make it Pro-only.
 *
 * If the user doesn't have a Pro license, shows the PageUpgrade screen instead.
 *
 * Usage:
 * ```tsx
 * import { withProAccess } from '@wcpos/core/screens/main/components/pro-guard';
 * import { OrdersScreen } from '@wcpos/core/screens/main/orders';
 *
 * export default withProAccess(OrdersScreen, 'orders');
 * ```
 */
export const withProAccess = <P extends object>(
	WrappedComponent: React.ComponentType<P>,
	page: ProPage
) => {
	function ProAccessWrapper(props: P) {
		const { isPro } = useLicense();

		if (!isPro) {
			return <PageUpgrade page={page} />;
		}

		return <WrappedComponent {...props} />;
	}

	return ProAccessWrapper;
};
