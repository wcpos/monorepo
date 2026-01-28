import * as React from 'react';

import { swapCollection, swapCollections, useQueryManager } from '@wcpos/query';
import type { CollectionSwapResult } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useAppState } from '../../../contexts/app-state';

import type { CollectionKey } from './use-collection';

const logger = getLogger(['wcpos', 'hooks', 'useCollectionReset']);

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

	/**
	 * Clear the collection and then trigger a fresh sync.
	 *
	 * After swap, waits for queries to re-register then triggers sync
	 * on the manager's replications (which are connected to the UI).
	 */
	const clearAndSync = React.useCallback(async (): Promise<void> => {
		logger.debug('clearAndSync: starting', { context: { key } });

		const results = await clear();
		logger.debug('clearAndSync: swap results', {
			context: {
				results: results.map((r) => ({ success: r.success, collectionName: r.collectionName })),
			},
		});

		// Wait for queries to re-register and replications to be created
		// This gives time for reset$ to propagate and queries to be recreated
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Trigger sync on manager's replications
		for (const result of results) {
			if (result.success && result.collectionName) {
				logger.debug('clearAndSync: looking for replication in manager', {
					context: { collectionName: result.collectionName },
				});

				// Find and run replications from the manager's replicationStates
				manager.replicationStates.forEach((replication, endpoint) => {
					if ((replication as any)?.collection?.name === result.collectionName) {
						logger.debug('clearAndSync: triggering sync on manager replication', {
							context: { collectionName: result.collectionName, endpoint },
						});
						replication.run({ force: true });
					}
				});
			}
		}

		logger.debug('clearAndSync: complete', { context: { key } });
	}, [clear, key, manager]);

	return { clear, clearAndSync };
};
