import * as React from 'react';

import { TaxRatesContext } from './provider';

/**
 *
 */
export const useTaxRates = () => {
	if (TaxRatesContext === undefined) {
		throw new Error(`useTaxRates must be called within TaxRatesContext`);
	}

	const context = React.useContext(TaxRatesContext);
	if (!context) {
		throw new Error('useTaxRates must be called within TaxRatesProvider');
	}
	return context;
};
