import * as React from 'react';

import { useForceUpdate, useSubscription } from 'observable-hooks';
import { debounceTime } from 'rxjs/operators';

import { useQueryManager } from './provider';

import type { QueryParams, QueryHooks } from './query-state';

export interface QueryOptions {
	queryKeys: (string | number | object)[];
	collectionName: string;
	initialParams?: QueryParams;
	hooks?: QueryHooks;
	locale?: string;
	endpoint?: string;
}

export const useQuery = (queryOptions: QueryOptions) => {
	// const forceUpdate = useForceUpdate();
	const manager = useQueryManager();
	const query = manager.registerQuery(queryOptions);

	/**
	 *
	 */
	React.useEffect(() => {
		return () => {
			manager.maybePauseQueryReplications(query);
		};
	}, [query, manager]);

	/**
	 * This is a hack for when when collection is reset:
	 * - re-render components that use this query
	 * - on re-render the query is recreated
	 * - give the collection time to re-add before re-creating the query
	 */
	// useSubscription(query.cancel$.pipe(debounceTime(1000)), forceUpdate);

	return query;
};
