import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useLicense } from '../hooks/use-license';
import { PageUpgrade } from '../page-upgrade';

type ProPage = 'products' | 'orders' | 'customers' | 'reports';

interface ProGuardProps {
	page: ProPage;
	component: React.LazyExoticComponent<React.ComponentType<any>>;
}

/**
 * A guard component that conditionally renders Pro-only screens.
 *
 * Uses React.lazy to ensure Pro-only code is in a separate bundle chunk
 * and is only downloaded when the user has a Pro license.
 *
 * Usage:
 * ```tsx
 * const OrdersScreen = React.lazy(() =>
 *   import('@wcpos/core/screens/main/orders').then((m) => ({ default: m.OrdersScreen }))
 * );
 *
 * export default function OrdersPage() {
 *   return <ProGuard page="orders" component={OrdersScreen} />;
 * }
 * ```
 */
export const ProGuard = ({ page, component: LazyComponent }: ProGuardProps) => {
	const { isPro } = useLicense();

	if (!isPro) {
		return <PageUpgrade page={page} />;
	}

	return (
		<React.Suspense
			fallback={
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator size="large" />
				</View>
			}
		>
			<LazyComponent />
		</React.Suspense>
	);
};
