import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { TaxRateContext } from './provider';

export const useTaxRates = () => {
	const context = React.useContext(TaxRateContext);
	if (!context) {
		throw new Error(`useTaxes must be called within TaxesContext`);
	}

	const data = useObservableSuspense(context.resource);

	return { ...context, data };
};
