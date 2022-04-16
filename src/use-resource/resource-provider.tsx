import * as React from 'react';
import { ObservableResource } from 'observable-hooks';
import useCountryResource, { Country } from '../use-country-resource';
import useTaxRatesResource from '../use-tax-rates-resource';

type TaxRate = import('@wcpos/database').TaxRateDocument;

interface ResourceContextProps {
	countriesResource: ObservableResource<Country[]>;
	taxRatesResource: ObservableResource<TaxRate[]>;
}

export const ResourceContext = React.createContext<ResourceContextProps>(null);

interface ResourceProviderProps {
	children: React.ReactNode;
}

export const ResourceProvider = ({ children }: ResourceProviderProps) => {
	const countriesResource = useCountryResource();
	const taxRatesResource = useTaxRatesResource();

	const value = React.useMemo(() => {
		return {
			countriesResource,
			taxRatesResource,
		};
	}, [countriesResource, taxRatesResource]);

	return <ResourceContext.Provider value={value}>{children}</ResourceContext.Provider>;
};
