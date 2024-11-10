import * as React from 'react';

import { useAppState } from '../../../contexts/app-state';

import type { CollectionKey } from './use-collection';

/**
 * Reset collection map
 * - Some collections are linked, so we need to reset them all
 */
const resetCollectionNames = {
	products: ['variations', 'products'],
};

/**
 *
 */
export const useCollectionReset = (key: CollectionKey) => {
	const { storeDB, fastStoreDB } = useAppState();

	/**
	 *
	 */
	const clear = React.useCallback(async () => {
		const keys = resetCollectionNames[key] || [key];
		const collections = [];
		// foreach key, get the collection from fastStoreDB.collections and storeDB.collections
		keys.forEach((key) => {
			collections.push(fastStoreDB.collections[key]);
			collections.push(storeDB.collections[key]);
		});

		await Promise.all(collections.map((collection) => collection.remove()));

		/**
		 * @FIXME - It's proving difficult to do a reset of collections, there is so many subscription
		 * issues to consider. For now, just reload the page.
		 */
		window.location.reload();
	}, [fastStoreDB, key, storeDB]);

	return { clear };
};
