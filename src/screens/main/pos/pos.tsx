import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useQuery } from '@wcpos/query';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { Suspense } from '@wcpos/tailwind/src/suspense';

import POSColumns from './columns';
import { useCurrentOrder } from './contexts/current-order';
import POSTabs from './tabs';
import { TaxRatesProvider } from '../contexts/tax-rates';

/**
 *
 */
const POS = () => {
	const dimensions = useWindowDimensions();
	const { currentOrder } = useCurrentOrder();

	/**
	 *
	 */
	const taxQuery = useQuery({
		queryKeys: ['tax-rates'],
		collectionName: 'taxes',
	});

	return (
		<>
			<ErrorBoundary>
				<TaxRatesProvider taxQuery={taxQuery} order={currentOrder}>
					<Suspense>{dimensions.width >= 640 ? <POSColumns /> : <POSTabs />}</Suspense>
				</TaxRatesProvider>
			</ErrorBoundary>
		</>
	);
};

export default POS;
