import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import set from 'lodash/set';
import { ObservableResource } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { useReplication } from './use-replication';
import useStore from '../../../../contexts/store';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type CustomerDocument = import('@wcpos/database/src/collections/customers').CustomerDocument;

export const CustomersContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<CustomerDocument[]>;
	sync: () => void;
	clear: () => Promise<any>;
}>(null);

interface CustomersProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	uiSettings: import('../ui-settings').UISettingsDocument;
}

const CustomersProvider = ({ children, initialQuery, uiSettings }: CustomersProviderProps) => {
	log.debug('render customer provider');
	const { storeDB } = useStore();
	const collection = storeDB.collections.customers;
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
	 * Clear
	 */
	const clear = React.useCallback(async () => {
		const query = collection.find();
		return query.remove();
	}, [collection]);

	/**
	 * Sync
	 */
	const sync = React.useCallback(() => {
		replicationState.reSync();
	}, [replicationState]);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const resource$ = query$.pipe(
			switchMap((query) => {
				const { search, selector = {}, sortBy, sortDirection } = query;

				if (search) {
					set(selector, ['username', '$regex'], new RegExp(escape(search), 'i'));
				}

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					map((result) => {
						return orderBy(result, [sortBy], [sortDirection]);
					})
				);
			})
		);

		return {
			resource: new ObservableResource(resource$),
		};
	}, [query$, collection]);

	return (
		<CustomersContext.Provider value={{ ...value, sync, clear, query$, setQuery }}>
			{children}
		</CustomersContext.Provider>
	);
};

export default CustomersProvider;
