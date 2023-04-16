import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { useReplication } from './use-replication';
import useCollection from '../../hooks/use-collection';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type TaxRateDocument = import('@wcpos/database/src/collections/tax-rates').TaxRateDocument;

export const TaxRateContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<TaxRateDocument[]>;
	sync: () => void;
}>(null);

interface TaxRateProviderProps {
	children: React.ReactNode;
	initialQuery?: QueryState;
	uiSettings: import('../ui-settings').UISettingsDocument;
	queryKey?: string;
}

const TaxRateProvider = ({
	children,
	initialQuery,
	ui,
	queryKey = 'taxes',
}: TaxRateProviderProps) => {
	const collection = useCollection('taxes');
	const { query$, setQuery } = useQuery(initialQuery, queryKey);
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
							$or: [{ state: q.state }, { state: '*' }, { state: '' }],
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

	return <TaxRateContext.Provider value={value}>{children}</TaxRateContext.Provider>;
};

export default TaxRateProvider;
