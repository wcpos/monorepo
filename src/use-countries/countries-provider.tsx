import * as React from 'react';

export const CountriesContext = React.createContext<any>(null);

interface CountriesProviderProps {
	children: React.ReactNode;
}

const CountriesProvider = ({ children }: CountriesProviderProps) => {
	const value = {};

	return <CountriesContext.Provider value={value}>{children}</CountriesContext.Provider>;
};

export default CountriesProvider;
