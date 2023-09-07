import * as React from 'react';

import get from 'lodash/get';

import * as categories from './hooks/categories';
import * as customers from './hooks/customers';
import * as orders from './hooks/orders';
import * as products from './hooks/products';
import * as tags from './hooks/tags';
import * as taxes from './hooks/tax-rates';
import * as variations from './hooks/variations';
import { useStoreStateManager } from '../../contexts/store-state-manager';
import { useCollection, CollectionKey } from '../use-collection';
import { useRestHttpClient } from '../use-rest-http-client';

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
	collectionName: CollectionKey;
	parent?: any;
}

/**
 *
 */
export const useReplicationState = <T>({ collectionName, parent }: Props) => {
	const manager = useStoreStateManager();
	const { collection } = useCollection(collectionName);

	/**
	 * Bit of a hack to get the right endpoint for variations
	 */
	let endpoint = collectionName;
	if (collectionName === 'variations') {
		if (!parent) {
			throw new Error('parent is required for variations');
		}
		endpoint = `products/${parent.id}/variations`;
	}

	const http = useRestHttpClient(endpoint);
	const hooks = get(allHooks, collectionName, {});

	const replicationState = manager.registerReplicationState<T>(
		endpoint,
		collection,
		http,
		hooks,
		parent
	);

	/**
	 * This is a bit of a hack
	 * If the http client changes, eg: the user updates auth, we need to update the http client
	 * Another option would be to deregister the replication state and register a new one,
	 * like we do with collection changes
	 */
	React.useEffect(() => {
		replicationState.setHttpClient(http);
	}, [http, replicationState]);

	return replicationState;
};
