import * as React from 'react';

import allCurrencies from './currencies.json';

export const CurrenciesContext = React.createContext<any>(null);

interface CurrenciesProviderProps {
	children: React.ReactNode;
	code?: string;
}

const CurrenciesProvider = ({ children, code }: CurrenciesProviderProps) => {
	const value = code ? allCurrencies.find((currency) => currency.code === code) : allCurrencies;

	return <CurrenciesContext.Provider value={value}>{children}</CurrenciesContext.Provider>;
};

export default CurrenciesProvider;
