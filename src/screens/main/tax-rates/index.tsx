import * as React from 'react';

import TaxRatesTabs from './tabs';
import { Query } from '../contexts/query';
import { TaxRateProvider } from '../contexts/tax-rates';

const query = new Query({});

/**
 *
 */
export const TaxRatesWithProvider = () => {
	return (
		<TaxRateProvider query={query}>
			<TaxRatesTabs />
		</TaxRateProvider>
	);
};

export default TaxRatesWithProvider;
