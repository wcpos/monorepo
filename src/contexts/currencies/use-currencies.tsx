import * as React from 'react';

import { CurrenciesContext } from './provider';

export const useCurrencies = () => {
	const context = React.useContext(CurrenciesContext);
	if (!context) {
		throw new Error(`useCurrencies must be called within CurrenciesProvider`);
	}

	return context;
};
