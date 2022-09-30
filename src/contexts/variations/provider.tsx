import * as React from 'react';
import { of } from 'rxjs';
import { ObservableResource } from 'observable-hooks';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type ProductVariationDocument =
	import('@wcpos/database/src/collections/variations').ProductVariationDocument;
type ProductDocument = import('@wcpos/database/src/collections/products').ProductDocument;

export const VariationsContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<ProductVariationDocument[]>;
	sync: () => void;
}>(null);

interface VariationsProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	parent: ProductDocument;
	ui?: import('@wcpos/hooks/src/use-store').UIDocument;
}

const VariationsProvider = ({ children, initialQuery, parent, ui }: VariationsProviderProps) => {
	console.log('render variations provider');
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

	return <VariationsContext.Provider value={value}>{children}</VariationsContext.Provider>;
};

export default VariationsProvider;
