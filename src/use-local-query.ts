import * as React from 'react';

import { useQueryManager } from './provider';
import { Query, QueryParams, QueryHooks } from './query-state';

export interface QueryOptions {
	queryKeys: (string | number | object)[];
	collectionName: string;
	initialParams?: QueryParams;
	hooks?: QueryHooks;
	locale?: string;
	endpoint?: string;
}

export const useLocalQuery = (queryOptions: QueryOptions) => {
	const manager = useQueryManager();

	const query = React.useMemo(() => {
		return new Query({
			id: 'logs',
			collection: manager.localDB.collections.logs,
			initialParams: queryOptions.initialParams,
		});
	}, [manager.localDB.collections.logs, queryOptions.initialParams]);

	return query;
};
