import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { OpenOrders } from '@wcpos/core/screens/main/pos/cart';

export default function POSCartTab() {
	return (
		<ErrorBoundary>
			<Suspense>
				<OpenOrders />
			</Suspense>
		</ErrorBoundary>
	);
}
