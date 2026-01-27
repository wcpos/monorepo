import * as React from 'react';

import { swapCollection, swapCollections, useQueryManager } from '@wcpos/query';
import type { CollectionSwapResult } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';

import type { CollectionKey } from './use-collection';

/**
 * Hook for safely resetting (clearing) a collection.
 *
 * Uses swapCollection which:
 * 1. Cancels all queries and replications for the collection
 * 2. Removes the collection (data is cleared instantly, regardless of size)
 * 3. Waits for the reset-collection plugin to re-create the collection
 *
 * This is much faster than deleteAll() for large datasets (100k+ records).
 */
export const useCollectionReset = (key: CollectionKey) => {
	const { storeDB, fastStoreDB } = useAppState();
	const manager = useQueryManager();

	/**
	 * Clear the collection and all associated data.
	 *
	 * Special case for products: also clears the variations collection first,
	 * since variations are children of products and should be cleared together.
	 *
	 * @returns Promise with results from each collection swap
	 */
	const clear = React.useCallback(async (): Promise<CollectionSwapResult[]> => {
		if (key === 'products') {
			// Products have associated variations - clear both
			// Order matters: variations first, then products
			return swapCollections({
				manager,
				collectionNames: ['variations', 'products'],
				storeDB,
				fastStoreDB,
			});
		}

		// Single collection swap
		const result = await swapCollection({
			manager,
			collectionName: key,
			storeDB,
			fastStoreDB,
		});

		return [result];
	}, [fastStoreDB, key, manager, storeDB]);

	return { clear };
};
