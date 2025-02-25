import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { useQuery } from '@wcpos/query';

import { Products } from './products';
import { TaxRatesProvider } from '../contexts/tax-rates';

export const ProductsScreen = () => {
	/**
	 *
	 */
	const taxQuery = useQuery({
		queryKeys: ['tax-rates'],
		collectionName: 'taxes',
	});

	return (
		<ErrorBoundary>
			<Suspense>
				<TaxRatesProvider taxQuery={taxQuery}>
					<Suspense>
						<Products />
					</Suspense>
				</TaxRatesProvider>
			</Suspense>
		</ErrorBoundary>
	);
};
