import * as React from 'react';
import { tap, switchMap, map, debounceTime } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import useStore from '@wcpos/hooks/src/use-store';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import { useReplication } from './use-replication';

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
	console.log('render tax provider');
	const { storeDB } = useStore();
	const collection = storeDB.collections.taxes;
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplication({ collection });

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
