import * as React from 'react';

import { useQuery } from '@wcpos/query';
import { Suspense } from '@wcpos/tailwind/src/suspense';

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
