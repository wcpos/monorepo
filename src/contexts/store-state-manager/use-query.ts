import * as React from 'react';

import { useFocusEffect } from '@react-navigation/native';
import { queries } from '@testing-library/react';
import get from 'lodash/get';
import { useObservable, useSubscription } from 'observable-hooks';
import { switchMap } from 'rxjs/operators';

import * as categories from './hooks/categories';
import * as customers from './hooks/customers';
import * as orders from './hooks/orders';
import * as products from './hooks/products';
import * as tags from './hooks/tags';
import * as taxes from './hooks/tax-rates';
import * as variations from './hooks/variations';
import { Query, QueryState } from './query';
import { useStoreStateManager } from './use-store-state-manager';
import { useCollection } from '../../hooks/use-collection';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

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
	const { collection } = useCollection(collectionName);
	const hooks = get(allHooks, collectionName, {});
	const endpoint =
		collectionName === 'variations' ? `products/${parent.id}/variations` : collectionName;
	const http = useRestHttpClient(endpoint);

	/**
	 * get the query (it will be registered if it doesn't exist)
	 */
	const query = manager.registerQuery<T>(queryKeys, collection, initialQuery, hooks);

	/**
	 *
	 */
	const replicationState = manager.registerReplicationState<T>(endpoint, collection, http, hooks);
	query.replicationState = replicationState;

	/**
	 *
	 */
	useSubscription(query.state$, (state) => {
		console.log('query state changed', state);
		replicationState.start(query);
	});

	/**
	 *
	 */
	query.clear = React.useCallback(async () => {
		manager.deregisterQuery(queryKeys);
		manager.deregisterReplicationState(endpoint);
		await manager.storeDB.reset(clearCollectionNames[collectionName] || [collectionName]);
	}, [collectionName, endpoint, manager, queryKeys]);

	/**
	 *
	 */
	query.sync = React.useCallback(() => {
		replicationState.start(query);
	}, [query, replicationState]);

	/**
	 *
	 */
	useFocusEffect(
		React.useCallback(() => {
			console.log('useFocusEffect resume replication');
			replicationState.resume(query);
			// Add cleanup logic
			return () => {
				console.log('useFocusEffect pause replication');
				replicationState.pause();
				// @TODO - this cleans up too often and causes issues
				// how to cleanup only when the query is no longer needed?
				// if I clean up here, it gets deregistered too often, child components throw errors
				// manager.deregisterQuery(queryKeys);
			};
		}, [query, replicationState])
	);

	return query;
};
