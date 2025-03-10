import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { useQuery } from '@wcpos/query';

import { TaxRates } from './tax-rates';

export const TaxRatesModal = () => {
	const query = useQuery({
		queryKeys: ['tax-rates'],
		collectionName: 'taxes',
		initialParams: {},
	});

	return (
		<ErrorBoundary>
			<Suspense>
				<TaxRates query={query} />
			</Suspense>
		</ErrorBoundary>
	);
};
