import * as React from 'react';

import { useQueryManager } from './provider';

import type { QueryParams, QueryHooks } from './query-state';

interface QueryOptions {
	queryKey: (string | number | object)[];
	collectionName: string;
	initialParams: QueryParams;
	hooks?: QueryHooks;
	locale?: string;
}

export const useQuery = (queryOptions: QueryOptions) => {
	const queryManager = useQueryManager();
	const query = queryManager.registerQuery(queryOptions);

	return query;
};
