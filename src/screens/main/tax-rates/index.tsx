import * as React from 'react';

import Suspense from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import TaxRatesTabs from './tabs';

/**
 *
 */
export const TaxRates = () => {
	const query = useQuery({
		queryKeys: ['tax-rates'],
		collectionName: 'taxes',
		initialParams: {},
	});

	return (
		<Suspense>
			<TaxRatesTabs query={query} />
		</Suspense>
	);
};

export default TaxRates;
