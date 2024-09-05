import * as React from 'react';

import { CountriesContext } from './countries-provider';

export const useCountries = () => {
	const context = React.useContext(CountriesContext);
	if (!context) {
		throw new Error(`useCountries must be called within CountriesProvider`);
	}

	return context;
};
