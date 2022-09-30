import * as React from 'react';
import { of } from 'rxjs';
import { ObservableResource } from 'observable-hooks';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type TaxRateDocument = import('@wcpos/database/src/collections/taxes').TaxRateDocument;

export const TaxesContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<TaxRateDocument[]>;
	sync: () => void;
}>(null);

interface TaxesProviderProps {
	children: React.ReactNode;
	initialQuery?: QueryState;
	ui?: import('@wcpos/hooks/src/use-store').UIDocument;
}

const TaxesProvider = ({ children, initialQuery, ui }: TaxesProviderProps) => {
	console.log('render product provider');
	const { query$, setQuery } = useQuery(initialQuery);

	/**
	 *
	 */
	const sync = React.useCallback(() => {}, []);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		return {
			query$,
			setQuery,
			resource: new ObservableResource(of([])),
			sync,
		};
	}, [query$, setQuery, sync]);

	return <TaxesContext.Provider value={value}>{children}</TaxesContext.Provider>;
};

export default TaxesProvider;
