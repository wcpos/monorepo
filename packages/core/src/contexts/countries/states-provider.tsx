import * as React from 'react';

import allCountries from './countries.json';

export const StatesContext = React.createContext<any>(null);

interface StatesProviderProps {
	children: React.ReactNode;
	countryCode: string;
}

/**
 * @TODO - fetch states from the server, and cache locally
 */
export const StatesProvider = ({ children, countryCode }: StatesProviderProps) => {
	if (!countryCode) {
		throw new Error('countryCode is required');
	}

	const country = allCountries.find((country) => country.code === countryCode);

	return <StatesContext.Provider value={country.states}>{children}</StatesContext.Provider>;
};
