import * as React from 'react';

import allCountries from './countries.json';

export const CountriesContext = React.createContext<any>(null);

interface CountriesProviderProps {
	children: React.ReactNode;
	countryCode?: string;
}

const CountriesProvider = ({ children, countryCode }: CountriesProviderProps) => {
	const value = countryCode
		? allCountries.find((country) => country.code === countryCode)
		: allCountries;

	return <CountriesContext.Provider value={value}>{children}</CountriesContext.Provider>;
};

export default CountriesProvider;
