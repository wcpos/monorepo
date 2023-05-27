import * as React from 'react';

import TaxRatesTabs from './tabs';
import { TaxRateProvider } from '../contexts/tax-rates';

const initialQuery = {};

/**
 *
 */
export const TaxRatesWithProvider = () => {
	return (
		<TaxRateProvider initialQuery={initialQuery}>
			<TaxRatesTabs />
		</TaxRateProvider>
	);
};

export default TaxRatesWithProvider;
