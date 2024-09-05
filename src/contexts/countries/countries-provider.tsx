import * as React from 'react';

import allCountries from './countries.json';

export const CountriesContext = React.createContext<typeof allCountries>(null);

interface CountriesProviderProps {
	children: React.ReactNode;
}

/**
 * @TODO - fetch countries from the server, and cache locally
 */
export const CountriesProvider = ({ children }: CountriesProviderProps) => {
	return <CountriesContext.Provider value={allCountries}>{children}</CountriesContext.Provider>;
};
