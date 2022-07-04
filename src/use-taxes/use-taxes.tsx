import * as React from 'react';
import { TaxesContext } from './taxes-provider';

export const useTaxes = () => {
	const context = React.useContext(TaxesContext);
	if (!context) {
		throw new Error(`useTaxes must be called within TaxesProvider`);
	}

	return context;
};
