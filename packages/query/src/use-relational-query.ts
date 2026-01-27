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
	 * Register queries immediately when manager changes.
	 * This handles store switches - new manager = new query registration.
	 */
	const initialQueries = React.useMemo(() => registerQueries(), [registerQueries]);

	/**
	 * Subscribe to collection resets to re-register queries.
	 * useMemo ensures we subscribe to the current manager's reset$.
	 */
	const reset$ = React.useMemo(
		() =>
			manager.localDB.reset$.pipe(
				filter((collection) => collection.name === parentOptions.collectionName),
				map(() => registerQueries())
			),
		[manager, parentOptions.collectionName, registerQueries]
	);

	/**
	 * Use initialQueries as the default value, update when reset$ emits.
	 */
	const { parentQuery, childQuery, parentLookupQuery } = useObservableState(
		reset$,
		initialQueries
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
