import * as React from 'react';
import { useObservableState, ObservableResource } from 'observable-hooks';
import { map, tap } from 'rxjs/operators';
import useStore from '@wcpos/hooks/src/use-store';
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
	initialQuery?: QueryState;
	parent: ProductDocument;
	ui?: import('@wcpos/hooks/src/use-store').UIDocument;
}

const VariationsProvider = ({ children, initialQuery, parent, ui }: VariationsProviderProps) => {
	console.log('render variations provider');
	const { storeDB } = useStore();
	const collection = storeDB.collections.variations;
	const variationIds = useObservableState(parent.variations$, parent.variations);

	// const { query$, setQuery } = useQuery(initialQuery);

	/**
	 *
	 */
	const sync = React.useCallback(() => {}, []);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const variations$ = collection
			.findByIds$(variationIds?.map((id) => String(id)) || [])
			.pipe(map((docsMap) => Array.from(docsMap.values())));

		return {
			// query$,
			// setQuery,
			resource: new ObservableResource(variations$),
			sync,
		};
	}, [collection, sync, variationIds]);

	return <VariationsContext.Provider value={value}>{children}</VariationsContext.Provider>;
};

export default VariationsProvider;
