import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { useQueryManager } from './provider';

import type { Query, QueryResult } from './query-state';

interface InfiniteScrollResult<T> extends QueryResult<T> {
	nextPage: () => void;
}

export const useInfiniteScroll = (
	query: Query<any>,
	config = {
		pageSize: 10,
	}
) => {
	const result = useObservableSuspense(query.resource);
	const [pageNumber, setPageNumber] = React.useState(1);
	const manager = useQueryManager();

	/**
	 *
	 */
	const nextPage = React.useCallback(() => {
		setPageNumber((currentPage) => {
			if (currentPage * config.pageSize >= result.count) {
				return currentPage;
			}
			return currentPage + 1;
		});
	}, [config.pageSize, result.count]);

	/**
	 *
	 */
	const paginatedResult = React.useMemo(() => {
		return result.hits.slice(0, pageNumber * config.pageSize);
	}, [config.pageSize, pageNumber, result.hits]);

	/**
	 *
	 */
	React.useEffect(() => {
		if (result.hits.length === paginatedResult.length) {
			if (manager.activeQueryReplications.has(query.id)) {
				const replication = manager.activeQueryReplications.get(query.id);
				if (
					replication
					//&& replication.hasNextPage()
				) {
					replication.nextPage();
				}
			}
		}
	}, [manager.activeQueryReplications, paginatedResult.length, query.id, result.hits.length]);

	/**
	 *
	 */
	return {
		...result,
		hits: paginatedResult,
		nextPage,
	} as InfiniteScrollResult<(typeof result.hits)[0]>;
};
