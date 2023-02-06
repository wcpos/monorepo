import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { tap, switchMap, map, debounceTime } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { useReplication } from './use-replication';
import useStore from '../../contexts/store';
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
	ui?: import('../../contexts/ui').UIDocument;
}

const TaxesProvider = ({ children, initialQuery, ui }: TaxesProviderProps) => {
	log.debug('render tax provider');
	const { storeDB } = useStore();
	const collection = storeDB.collections.taxes;
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplication({ collection });

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
		const resource$ = query$.pipe(
			// debounce hits to the local db
			debounceTime(100),
			// switchMap to the collection query
			switchMap((q) => {
				const selector = {
					country: {
						$eq: q.country,
					},
				};

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					map((result) => result)
					// tap((res) => {
					// 	debugger;
					// })
				);
			})
		);

		return {
			query$,
			setQuery,
			resource: new ObservableResource(resource$),
			replicationState,
		};
	}, [query$, setQuery, replicationState, collection]);

	return <TaxesContext.Provider value={value}>{children}</TaxesContext.Provider>;
};

export default TaxesProvider;
