import * as React from 'react';

import TaxRatesTabs from './tabs';
import { useQuery } from '../../../contexts/store-state-manager';

/**
 *
 */
export const TaxRates = () => {
	const query = useQuery({
		queryKeys: ['tax-rates'],
		collectionName: 'taxes',
		initialQuery: {},
	});

	return <TaxRatesTabs query={query} />;
};

export default TaxRates;
