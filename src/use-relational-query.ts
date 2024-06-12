import * as React from 'react';

import { useSubscription, useForceUpdate } from 'observable-hooks';
import { merge } from 'rxjs';

import { useQueryManager } from './provider';

import type { QueryOptions } from './use-query';

export const useRelationalQuery = (parentOptions: QueryOptions, childOptions: QueryOptions) => {
	// const forceUpdate = useForceUpdate();
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
	// useSubscription(
	// 	merge(parentQuery.cancel$, childQuery.cancel$, parentLookupQuery.cancel$),
	// 	forceUpdate
	// );

	return { parentQuery, childQuery, parentLookupQuery };
};
