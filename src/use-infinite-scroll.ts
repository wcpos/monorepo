import * as React from 'react';

import debounce from 'lodash/debounce';
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
): InfiniteScrollResult<any> => {
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
	 * Debounced version of nextPage
	 */
	const debouncedNextPage = React.useMemo(() => debounce(nextPage, 200), [nextPage]);

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
		count: result.count,
		hits: paginatedResult,
		nextPage: debouncedNextPage,
	} as InfiniteScrollResult<(typeof result.hits)[0]>;
};
