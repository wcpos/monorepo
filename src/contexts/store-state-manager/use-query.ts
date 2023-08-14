import * as React from 'react';

import { useFocusEffect } from '@react-navigation/native';
import get from 'lodash/get';

import * as categories from './hooks/categories';
import * as customers from './hooks/customers';
import * as orders from './hooks/orders';
import * as products from './hooks/products';
import * as tags from './hooks/tags';
import * as taxes from './hooks/tax-rates';
import * as variations from './hooks/variations';
import { Query, QueryState } from './query';
import { useReplicationState } from './use-replication-state';
import { useStoreStateManager } from './use-store-state-manager';

interface QueryOptions {
	queryKeys: (string | number | object)[];
	collectionName: string;
	initialQuery?: QueryState;
	parent?: any;
}

const allHooks = {
	products,
	variations,
	customers,
	'products/tags': tags,
	'products/categories': categories,
	taxes,
	orders,
};

const clearCollectionNames = {
	products: ['products', 'variations'],
	orders: ['orders', 'line_items', 'fee_lines', 'shipping_lines'],
};

/**
 *
 */
export const useQuery = <T>({
	queryKeys,
	collectionName,
	initialQuery,
	parent,
}: QueryOptions): Query<T> => {
	const manager = useStoreStateManager();
	const collection = manager.storeDB.collections[collectionName];
	const hooks = get(allHooks, collectionName, {});

	// get the query (it will be registered if it doesn't exist)
	const query = manager.registerQuery<T>(queryKeys, collection, initialQuery, hooks);

	// attach replicationState
	const replicationState = useReplicationState({ collection, query, hooks, parent });
	query.replicationState = replicationState;

	/**
	 *
	 */
	query.clear = React.useCallback(async () => {
		replicationState.cancel();
		await manager.storeDB.reset(clearCollectionNames[collectionName] || [collectionName]);
	}, [collectionName, manager.storeDB, replicationState]);

	/**
	 *
	 */
	query.sync = React.useCallback(() => {
		replicationState.reSync();
	}, [replicationState]);

	/**
	 *
	 */
	useFocusEffect(
		React.useCallback(() => {
			query.replicationState.start();
			// Add cleanup logic
			return () => {
				console.log('cleaning up query', queryKeys);
				query.replicationState.cancel();
				// @TODO - this cleans up too often and causes issues
				// how to cleanup only when the query is no longer needed?
				// if I clean up here, it gets deregistered too often, child components throw errors
				// manager.deregisterQuery(queryKeys);
			};
		}, [query.replicationState, queryKeys])
	);

	return query;
};
