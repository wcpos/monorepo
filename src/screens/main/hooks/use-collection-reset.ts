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
		fastStoreDB.reset(keys);
		storeDB.reset(keys);
	}, [fastStoreDB, key, storeDB]);

	return { clear };
};
