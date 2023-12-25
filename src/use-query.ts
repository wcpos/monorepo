import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { useQueryManager } from './provider';

import type { QueryParams, QueryHooks } from './query-state';

interface QueryOptions {
	queryKeys: (string | number | object)[];
	collectionName: string;
	initialParams?: QueryParams;
	hooks?: QueryHooks;
	locale?: string;
}

export const useQuery = (queryOptions: QueryOptions) => {
	const queryManager = useQueryManager();
	const query = queryManager.registerQuery(queryOptions);

	/**
	 * This is a hack for when when collection is reset:
	 * - re-register query
	 * - re-render components that use this query
	 */
	const trigger = useObservableState(query.cancel$.pipe(map(() => trigger + 1)), 0);

	return query;
};
