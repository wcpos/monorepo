import * as React from 'react';

import TaxRatesTabs from './tabs';
import { useQuery } from '../../../contexts/store-state-manager';

/**
 *
 */
export const TaxRates = () => {
	useQuery({
		queryKeys: ['tax-rates'],
		collectionName: 'taxes',
		initialQuery: {},
	});

	return <TaxRatesTabs />;
};

export default TaxRates;
