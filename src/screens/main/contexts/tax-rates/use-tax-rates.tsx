import * as React from 'react';

import { TaxRateContext } from './provider';

export const useTaxRates = () => {
	const context = React.useContext(TaxRateContext);
	if (!context) {
		throw new Error(`useTaxes must be called within TaxesContext`);
	}

	return context;
};
