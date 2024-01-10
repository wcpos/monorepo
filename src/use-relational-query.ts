import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { useQueryManager } from './provider';

import type { QueryOptions } from './use-query';

export const useRelationalQuery = (parentOptions: QueryOptions, childOptions: QueryOptions) => {
	const queryManager = useQueryManager();

	/**
	 *
	 */
	const childQuery = queryManager.registerQuery(childOptions);
	const parentLookupQuery = queryManager.registerQuery({
		...parentOptions,
		queryKeys: [...parentOptions.queryKeys, 'parentLookup'],
		initialParams: {
			selector: {
				id: { $in: [] },
			},
		},
	});

	/**
	 *
	 */
	const parentQuery = queryManager.registerRelationalQuery(
		parentOptions,
		childQuery,
		parentLookupQuery
	);

	/**
	 * This is a hack for when when collection is reset:
	 * - re-render components that use this query
	 * - on re-render the query is recreated
	 */
	const trigger = useObservableState(parentQuery.cancel$.pipe(map(() => trigger + 1)), 0);

	return { parentQuery, childQuery, parentLookupQuery };
};
