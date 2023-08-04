import { useEffect } from 'react';

import get from 'lodash/get';

import * as categories from './hooks/categories';
import * as customers from './hooks/customers';
import * as products from './hooks/products';
import * as tags from './hooks/tags';
import * as taxes from './hooks/tax-rates';
import * as variations from './hooks/variations';
import { Query, QueryState } from './query';
import { useStoreStateManager } from './use-store-state-manager';

interface QueryOptions {
	queryKeys: (string | number | object)[];
	collectionName: string;
	initialQuery?: QueryState;
}

const allHooks = {
	products,
	variations,
	customers,
	'products/tags': tags,
	'products/categories': categories,
	taxes,
};

/**
 *
 */
export const useQuery = <T>({
	queryKeys,
	collectionName,
	initialQuery,
}: QueryOptions): Query<T> => {
	const manager = useStoreStateManager();
	const collection = manager.storeDB.collections[collectionName];
	const hooks = get(allHooks, collectionName, {});

	// get the query (it will be registered if it doesn't exist)
	const query = manager.registerQuery<T>(queryKeys, collection, initialQuery, hooks);

	useEffect(() => {
		// Add cleanup logic
		return () => {
			// @TODO - this cleans up too often and causes issues
			// how to cleanup only when the query is no longer needed?
			// manager.deregisterQuery(queryKeys);
		};
	}, [manager, queryKeys]);

	return query;
};
