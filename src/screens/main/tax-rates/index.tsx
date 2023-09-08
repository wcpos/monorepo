import * as React from 'react';

import Suspense from '@wcpos/components/src/suspense';

import TaxRatesTabs from './tabs';
import { useQuery } from '../hooks/use-query';

/**
 *
 */
export const TaxRates = () => {
	const query = useQuery({
		queryKeys: ['tax-rates'],
		collectionName: 'taxes',
		initialQuery: {},
	});

	return (
		<Suspense>
			<TaxRatesTabs query={query} />
		</Suspense>
	);
};

export default TaxRates;
