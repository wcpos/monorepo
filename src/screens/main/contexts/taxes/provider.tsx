import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { useReplication } from './use-replication';
import useLocalData from '../../../../contexts/local-data';
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
	uiSettings: import('../ui-settings').UISettingsDocument;
}

const TaxesProvider = ({ children, initialQueryResource, ui }: TaxesProviderProps) => {
	log.debug('render tax provider');
	const { storeDB } = useLocalData();
	const collection = storeDB.collections.taxes;
	const initialQuery = useObservableSuspense(initialQueryResource);
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
			switchMap((q) => {
				const selector = {
					$and: [
						{
							$or: [{ country: q.country }, { country: '*' }, { country: '' }],
						},
						{
							$or: [{ state: 'AL' }, { state: '*' }, { state: '' }],
						},
						{
							$or: [{ city: q.city }, { city: '*' }, { city: '' }],
						},
					],
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
