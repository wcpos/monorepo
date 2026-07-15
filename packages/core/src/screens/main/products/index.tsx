import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';

import { Products } from './products';
import { TaxRatesProvider } from '../contexts/tax-rates';

export function ProductsScreen() {
	return (
		<ErrorBoundary>
			<Suspense>
				<TaxRatesProvider>
					<Suspense>
						<Products />
					</Suspense>
				</TaxRatesProvider>
			</Suspense>
		</ErrorBoundary>
	);
}
