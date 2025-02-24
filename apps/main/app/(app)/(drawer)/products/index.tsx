import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { TaxRatesProvider } from '@wcpos/core/screens/main/contexts/tax-rates';
import { Products } from '@wcpos/core/screens/main/products/products';
import { useQuery } from '@wcpos/query';

export default function ProductsIndex() {
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
}
