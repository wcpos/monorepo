import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { filter, map } from 'rxjs/operators';

import { useQueryManager } from './provider';

import type { QueryOptions } from './use-query';

export const useRelationalQuery = (parentOptions: QueryOptions, childOptions: QueryOptions) => {
	const manager = useQueryManager();

	/**
	 * Helper function to register all necessary queries.
	 */
	const registerQueries = () => {
		const childQuery = manager.registerQuery(childOptions);
		const parentLookupQuery = manager.registerQuery({
			...parentOptions,
			queryKeys: [...parentOptions.queryKeys, 'parentLookup'],
			initialParams: {
				selector: {
					id: { $in: [] },
				},
			},
			infiniteScroll: false,
		});
		const parentQuery = manager.registerRelationalQuery(
			parentOptions,
			childQuery,
			parentLookupQuery
		);
		return { childQuery, parentLookupQuery, parentQuery };
	};

	/**
	 * Listen for changes in localDB.reset$ and update queries accordingly.
	 */
	const { parentQuery, childQuery, parentLookupQuery } = useObservableState(
		manager.localDB.reset$.pipe(
			filter((collection) => collection.name === parentOptions.collectionName),
			map(registerQueries)
		),
		() => registerQueries()
	);

	/**
	 *
	 */
	React.useEffect(() => {
		return () => {
			manager.maybePauseQueryReplications(parentQuery);
			manager.maybePauseQueryReplications(childQuery);
			manager.maybePauseQueryReplications(parentLookupQuery);
		};
	}, [parentQuery, childQuery, parentLookupQuery, manager]);

	return { parentQuery };
};
