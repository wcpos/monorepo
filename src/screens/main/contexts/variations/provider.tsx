import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, ObservableResource } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { filterVariationsByAttributes } from './query.helpers';
import { useReplication } from './use-replication';
import useLocalData from '../../../../contexts/local-data';
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
	uiSettings?: import('../ui-settings').UISettingsDocument;
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
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplication({ parent, query$ });

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
		const variations$ = combineLatest([query$, parent.variations$]).pipe(
			switchMap(([query, variationIDs]) => {
				const selector = { id: { $in: variationIDs } };
				const RxQuery = collection.find({ selector });

				/**
				 *  $allMatch is not supported so I will have to filter the results
				 */
				return RxQuery.$.pipe(
					map((result) => {
						const allMatch = get(query, 'selector.attributes.$allMatch', null);
						const filteredResult = filterVariationsByAttributes(result, allMatch);
						return filteredResult;
					})
				);
			})
		);

		return {
			// query$,
			// setQuery,
			resource: new ObservableResource(variations$),
		};
	}, [collection, parent.variations$, query$]);

	return (
		<VariationsContext.Provider value={{ ...value, setQuery, query$ }}>
			{children}
		</VariationsContext.Provider>
	);
};

export default VariationsProvider;
