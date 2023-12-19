import * as React from 'react';

import get from 'lodash/get';

import { useQueryManager } from '@wcpos/query';

import * as categories from './hooks/categories';
import * as customers from './hooks/customers';
import * as orders from './hooks/orders';
import * as products from './hooks/products';
import * as tags from './hooks/tags';
import * as taxes from './hooks/tax-rates';
import * as variations from './hooks/variations';
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
	endpoint?: string;
}

/**
 *
 */
export const useReplicationState = <T>({ collectionName, endpoint }: Props) => {
	const manager = useQueryManager();
	const { collection } = useCollection(collectionName);
	const ep = endpoint || collectionName;
	const http = useRestHttpClient(ep);
	const hooks = get(allHooks, collectionName, {});

	const replicationState = manager.registerReplicationState<T>(ep, collection, http, hooks);

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
