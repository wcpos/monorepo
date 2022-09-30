import * as React from 'react';
import { of } from 'rxjs';
import { ObservableResource } from 'observable-hooks';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type OrderDocument = import('@wcpos/database/src/collections/orders').OrderDocument;

export const OrdersContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<OrderDocument[]>;
	sync: () => void;
}>(null);

interface OrdersProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	ui?: import('@wcpos/hooks/src/use-store').UIDocument;
}

const OrdersProvider = ({ children, initialQuery, ui }: OrdersProviderProps) => {
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

	return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
};

export default OrdersProvider;
