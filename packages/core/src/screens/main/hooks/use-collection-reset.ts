import * as React from 'react';

import { swapCollection, swapCollections, useQueryManager } from '@wcpos/query';
import type { CollectionSwapResult } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useAppState } from '../../../contexts/app-state';

import type { CollectionKey } from './use-collection';

const logger = getLogger(['wcpos', 'hooks', 'useCollectionReset']);

/**
 * Wait for a replication to be registered for a collection.
 * Polls the manager's replicationStates until found or timeout.
 *
 * @param manager - The query manager instance
 * @param collectionName - The collection name to wait for
 * @param timeout - Maximum time to wait in ms (default: 5000)
 * @param interval - Polling interval in ms (default: 50)
 * @returns true if replication found, false if timed out
 */
async function waitForReplication(
	manager: ReturnType<typeof useQueryManager>,
	collectionName: string,
	timeout = 5000,
	interval = 50
): Promise<boolean> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		// Check if any replication exists for this collection
		let found = false;
		manager.replicationStates.forEach((replication) => {
			if ((replication as any)?.collection?.name === collectionName) {
				found = true;
			}
		});

		if (found) {
			return true;
		}

		// Wait before next check
		await new Promise((resolve) => setTimeout(resolve, interval));
	}

	return false;
}

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

		// Trigger sync on manager's replications
		for (const result of results) {
			if (result.success && result.collectionName) {
				// Wait for the replication to be registered (with timeout)
				const replicationReady = await waitForReplication(manager, result.collectionName);

				if (!replicationReady) {
					logger.warn('clearAndSync: proceeding without confirmed replication', {
						context: { collectionName: result.collectionName },
					});
				}

				// Find and run replications from the manager's replicationStates
				manager.replicationStates.forEach((replication, endpoint) => {
					if ((replication as any)?.collection?.name === result.collectionName) {
						replication.run({ force: true });
					}
				});
			}
		}

		logger.debug('clearAndSync: complete', { context: { key } });
	}, [clear, key, manager]);

	return { clear, clearAndSync };
};
