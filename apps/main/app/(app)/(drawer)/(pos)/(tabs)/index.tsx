import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { POSProducts } from '@wcpos/core/screens/main/pos/products';

export default function POSProductsTab() {
	return (
		<ErrorBoundary>
			<Suspense>
				<POSProducts />
			</Suspense>
		</ErrorBoundary>
	);
}
