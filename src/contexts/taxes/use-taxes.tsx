import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { TaxesContext } from './provider';
import { calcTaxes as _calcTaxes } from './utils';

export const useTaxes = () => {
	const context = React.useContext(TaxesContext);
	if (!context) {
		throw new Error(`useTaxes must be called within TaxesContext`);
	}

	const rates = useObservableSuspense(context.resource);

	const calcTaxes = (price) => {
		return _calcTaxes(price, rates);
	};

	return { ...context, rates, calcTaxes };
};
