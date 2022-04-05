import * as React from 'react';
import { ObservableResource } from 'observable-hooks';
import useCountryResource, { Country } from '../use-country-resource';

interface ResourceContextProps {
	countriesResource: ObservableResource<Country[]>;
}

export const ResourceContext = React.createContext<ResourceContextProps>(null);

interface ResourceProviderProps {
	children: React.ReactNode;
}

export const ResourceProvider = ({ children }: ResourceProviderProps) => {
	const countriesResource = useCountryResource();

	const value = React.useMemo(() => {
		return {
			countriesResource,
		};
	}, [countriesResource]);

	return <ResourceContext.Provider value={value}>{children}</ResourceContext.Provider>;
};
