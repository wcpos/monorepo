import * as React from 'react';
import { of } from 'rxjs';
import { ObservableResource } from 'observable-hooks';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type CustomerDocument = import('@wcpos/database/src/collections/customers').CustomerDocument;

export const CustomersContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<CustomerDocument[]>;
	sync: () => void;
}>(null);

interface CustomersProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	ui?: import('@wcpos/hooks/src/use-store').UIDocument;
}

const CustomersProvider = ({ children, initialQuery, ui }: CustomersProviderProps) => {
	console.log('render customer provider');
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

	return <CustomersContext.Provider value={value}>{children}</CustomersContext.Provider>;
};

export default CustomersProvider;
