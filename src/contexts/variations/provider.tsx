import * as React from 'react';

import { useObservableState, ObservableResource } from 'observable-hooks';
import { map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { useReplication } from './use-replication';
import useStore from '../../contexts/store';
import { QueryObservable, QueryState, SetQuery } from '../use-query';

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
	const replicationState = useReplication({ collection, parent });

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const variations$ = parent.populate$('variations');

		return {
			// query$,
			// setQuery,
			resource: new ObservableResource(variations$),
			replicationState,
		};
	}, [parent, replicationState]);

	return <VariationsContext.Provider value={value}>{children}</VariationsContext.Provider>;
};

export default VariationsProvider;
