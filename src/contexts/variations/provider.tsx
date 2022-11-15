import * as React from 'react';

import { useObservableState, ObservableResource } from 'observable-hooks';
import { map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useStore from '../../contexts/store';
import { QueryObservable, QueryState, SetQuery } from '../use-query';
import { useReplication } from './use-replication';

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
	ui?: import('../../contexts/ui').UIDocument;
}

const VariationsProvider = ({ children, initialQuery, parent, ui }: VariationsProviderProps) => {
	log.debug('render variations provider');
	const { storeDB } = useStore();
	const collection = storeDB.collections.variations;
	const variationIds = useObservableState(parent.variations$, parent.variations);
	const replicationState = useReplication({ collection, parent });

	// const { query$, setQuery } = useQuery(initialQuery);

	/**
	 * Only run the replication when the Provider is mounted
	 */
	React.useEffect(() => {
		replicationState.start();
		return () => {
			// this is async, should we wait?
			replicationState.cancel();
		};
	}, [replicationState]);

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
			replicationState,
		};
	}, [collection, replicationState, variationIds]);

	return <VariationsContext.Provider value={value}>{children}</VariationsContext.Provider>;
};

export default VariationsProvider;
