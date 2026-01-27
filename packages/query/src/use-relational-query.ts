import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { filter, map, startWith } from 'rxjs/operators';

import { useQueryManager } from './provider';

import type { QueryOptions } from './use-query';

export const useRelationalQuery = (parentOptions: QueryOptions, childOptions: QueryOptions) => {
	const manager = useQueryManager();

	/**
	 * Helper function to register all necessary queries.
	 */
	const registerQueries = React.useCallback(() => {
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
	}, [manager, parentOptions, childOptions]);

	/**
	 * Create the observable that re-registers queries on collection reset.
	 * useMemo ensures we re-subscribe when manager changes (e.g., store switch).
	 */
	const reset$ = React.useMemo(
		() =>
			manager.localDB.reset$.pipe(
				filter((collection) => collection.name === parentOptions.collectionName),
				map(() => registerQueries()),
				startWith(registerQueries())
			),
		[manager, parentOptions.collectionName, registerQueries]
	);

	/**
	 * Subscribe to the observable and get current queries.
	 */
	const { parentQuery, childQuery, parentLookupQuery } = useObservableState(reset$);

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
