import * as React from 'react';

import { useObservableState, ObservableResource } from 'observable-hooks';
import { switchMap } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { useReplication } from './use-replication';
import useLocalData from '../../../../contexts/local-data';
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
	uiSettings: import('../ui-settings').UISettingsDocument;
}

const VariationsProvider = ({
	children,
	initialQuery,
	parent,
	uiSettings,
}: VariationsProviderProps) => {
	log.debug('render variations provider');
	const { storeDB } = useLocalData();
	const collection = storeDB.collections.variations;
	const replicationState = useReplication({ collection, parent });

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
		const variations$ = parent.variations$.pipe(
			switchMap((variationIDs) => {
				return collection.find({ selector: { id: { $in: variationIDs } } }).$;
			})
		);

		return {
			// query$,
			// setQuery,
			resource: new ObservableResource(variations$),
			replicationState,
		};
	}, [collection, parent.variations$, replicationState]);

	return <VariationsContext.Provider value={value}>{children}</VariationsContext.Provider>;
};

export default VariationsProvider;
