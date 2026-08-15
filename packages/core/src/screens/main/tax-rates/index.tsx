import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';

import { TAX_RATES_ALL_RESULTS_LIMIT, TAX_RATES_INITIAL_SORT } from './query-state';
import { TaxRates } from './tax-rates';
import { QueryStateProvider } from '../../../query';

export function TaxRatesModal() {
	return (
		<QueryStateProvider
			collection="tax-rates"
			initialPageSize={TAX_RATES_ALL_RESULTS_LIMIT}
			initialSort={TAX_RATES_INITIAL_SORT}
		>
			<ErrorBoundary>
				<Suspense>
					<TaxRates />
				</Suspense>
			</ErrorBoundary>
		</QueryStateProvider>
	);
}
