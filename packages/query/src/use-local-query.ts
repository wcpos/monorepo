import * as React from 'react';

import { useQueryManager } from './provider';
import { Query, QueryHooks, QueryParams } from './query-state';

export interface QueryOptions {
	queryKeys: (string | number | object)[];
	collectionName: string;
	initialParams?: QueryParams;
	hooks?: QueryHooks;
	locale?: string;
	endpoint?: string;
	infiniteScroll?: boolean;
}

export const useLocalQuery = (queryOptions: QueryOptions) => {
	const manager = useQueryManager();
	const logsCollection = (manager.localDB as any).collections.logs;

	const query = React.useMemo(() => {
		return new Query({
			id: 'logs',
			collection: logsCollection,
			initialParams: queryOptions.initialParams,
			infiniteScroll: queryOptions.infiniteScroll,
		});
	}, [logsCollection, queryOptions.initialParams, queryOptions.infiniteScroll]);

	return query;
};
