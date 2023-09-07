import * as React from 'react';

import { useFocusEffect } from '@react-navigation/native';
import get from 'lodash/get';
import { useSubscription } from 'observable-hooks';

import * as categories from './hooks/categories';
import * as customers from './hooks/customers';
import * as orders from './hooks/orders';
import * as products from './hooks/products';
import * as tags from './hooks/tags';
import * as taxes from './hooks/tax-rates';
import * as variations from './hooks/variations';
import { useCollection, CollectionKey } from '../../../../hooks/use-collection';
import { useStoreStateManager } from '../../contexts/store-state-manager';
import { useReplicationState } from '../use-replication-state';

const allHooks = {
	products,
	variations,
	customers,
	'products/tags': tags,
	'products/categories': categories,
	taxes,
	orders,
};

interface Props {
	queryKeys: (string | number | object)[];
	collectionName: CollectionKey;
	initialQuery?: QueryState;
	parent?: any;
}

const clearCollectionNames = {
	products: ['products', 'variations'],
	orders: ['orders', 'line_items', 'fee_lines', 'shipping_lines'],
};

/**
 * This is a bit messy, but works for now
 */
export const useQuery = <T>({ queryKeys, collectionName, initialQuery, parent }: Props) => {
	const manager = useStoreStateManager();
	const { collection } = useCollection(collectionName);
	const hooks = get(allHooks, collectionName, {});
	const replicationState = useReplicationState({ collectionName, parent });
	const endpoint =
		collectionName === 'variations' ? `products/${parent.id}/variations` : collectionName;

	/**
	 * get the query (it will be registered if it doesn't exist)
	 */
	const query = manager.registerQuery<T>(queryKeys, collection, initialQuery, hooks);
	query.replicationState = replicationState;

	/**
	 *
	 */
	useSubscription(query.state$, (state) => {
		console.log('query state changed', state);
		replicationState.runPull(query.getApiQueryParams());
	});

	/**
	 * @TODO - doing a storeDB.reset will recreate the collection, which will cause this hook to re-run
	 * If we deregister here it will create a new Query and ReplicationState
	 * It works, but I'm not super happy with it
	 */
	query.clear = React.useCallback(async () => {
		manager.deregisterQuery(queryKeys);
		manager.deregisterReplicationState(endpoint);
		/**
		 * @TODO - this is going to clear all variations!!
		 */
		await manager.storeDB.reset(clearCollectionNames[collectionName] || [collectionName]);
	}, [collectionName, endpoint, manager, queryKeys]);

	/**
	 *
	 */
	query.sync = React.useCallback(() => {
		replicationState.start();
		replicationState.runPull(query.getApiQueryParams());
	}, [query, replicationState]);

	/**
	 *
	 */
	query.nextPage = React.useCallback(() => {
		query.paginator.nextPage();
		if (!query.paginator.hasMore()) {
			replicationState.runPull(query.getApiQueryParams());
		}
	}, [query, replicationState]);

	/**
	 * This can run multiple times on a page for the same replicationState
	 * @TODO - fix this
	 */
	useFocusEffect(
		React.useCallback(() => {
			console.log(`useFocusEffect resume ${collectionName} replication`);
			replicationState.start();
			// Add cleanup logic
			return () => {
				console.log(`useFocusEffect pause ${collectionName} replication`);
				replicationState.pause();
				// @TODO - this cleans up too often and causes issues
				// how to cleanup only when the query is no longer needed?
				// if I clean up here, it gets deregistered too often, child components throw errors
				// manager.deregisterQuery(queryKeys);
			};
		}, [replicationState, collectionName])
	);

	return query;
};
