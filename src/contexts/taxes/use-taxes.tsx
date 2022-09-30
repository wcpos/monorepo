import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { TaxesContext } from './provider';

export const useTaxes = () => {
	const context = React.useContext(TaxesContext);
	if (!context) {
		throw new Error(`useTaxes must be called within TaxesContext`);
	}

	const data = useObservableSuspense(context.resource);

	return { ...context, data };
};
