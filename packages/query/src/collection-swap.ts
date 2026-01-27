import { firstValueFrom, race, timer } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';

import type { Manager } from './manager';
import type { RxCollection, RxDatabase } from 'rxdb';

const swapLogger = getLogger(['wcpos', 'query', 'collection-swap']);

/**
 * Configuration for collection swap operation
 */
export interface CollectionSwapConfig {
	/** The Manager instance to coordinate with */
	manager: Manager<any>;
	/** Name of the collection to swap */
	collectionName: string;
	/** Store database (main data) */
	storeDB: RxDatabase;
	/** Fast store database (sync state) */
	fastStoreDB: RxDatabase;
	/** Timeout for waiting for reset$ signal (ms) - default 30000 */
	timeout?: number;
}

/**
 * Result of a collection swap operation
 */
export interface CollectionSwapResult {
	success: boolean;
	/** Time taken in milliseconds */
	duration: number;
	/** New collection instance (if successful) */
	collection?: RxCollection;
	/** Error message (if failed) */
	error?: string;
}

/**
 * Atomically swap a collection for a fresh one.
 *
 * This utility handles the complex coordination required to safely reset a collection:
 *
 * 1. **Cancel active operations** - Deregisters queries and replications for the collection,
 *    which triggers AbortController to cancel in-flight HTTP requests
 *
 * 2. **Remove collections** - Removes both store and sync collections, which:
 *    - Drops all data (faster than deleteAll for large datasets)
 *    - Triggers RxDB's cleanup mechanisms
 *
 * 3. **Wait for reset** - The reset-collection plugin automatically re-adds the collection
 *    and emits on database.reset$ when ready
 *
 * Usage:
 * ```ts
 * const result = await swapCollection({
 *   manager,
 *   collectionName: 'products',
 *   storeDB,
 *   fastStoreDB,
 * });
 *
 * if (result.success) {
 *   console.log(`Collection reset in ${result.duration}ms`);
 * }
 * ```
 *
 * Why not use deleteAll?
 * - deleteAll with 100,000 records can take 30+ seconds
 * - collection.remove() is near-instant regardless of record count
 * - The reset-collection plugin handles re-creation automatically
 */
export async function swapCollection(config: CollectionSwapConfig): Promise<CollectionSwapResult> {
	const { manager, collectionName, storeDB, fastStoreDB, timeout = 30000 } = config;
	const startTime = performance.now();

	try {
		swapLogger.info(`Starting collection swap: ${collectionName}`, {
			context: { collectionName },
		});

		// Step 1: Validate that reset$ is available
		validateResetObservable(storeDB);

		// Step 2: Cancel all queries and replications for this collection
		// This triggers AbortController.abort() for in-flight requests
		await cancelCollectionOperations(manager, collectionName);

		// Step 3: Set up listener for reset$ before removing
		// The reset-collection plugin will emit after re-adding the collection
		const resetPromise = waitForReset(storeDB, collectionName, timeout);

		// Step 4: Remove collections (sync first, then store)
		// Removing sync collection first prevents sync operations during store removal
		await removeCollections(storeDB, fastStoreDB, collectionName);

		// Step 5: Wait for the collection to be re-added
		const newCollection = await resetPromise;

		const duration = performance.now() - startTime;

		swapLogger.info(`Collection swap complete: ${collectionName}`, {
			context: { collectionName, duration },
		});

		return {
			success: true,
			duration,
			collection: newCollection,
		};
	} catch (error: any) {
		const duration = performance.now() - startTime;

		swapLogger.error(`Collection swap failed: ${collectionName}`, {
			showToast: true,
			saveToDb: true,
			context: {
				collectionName,
				duration,
				error: error.message,
			},
		});

		return {
			success: false,
			duration,
			error: error.message,
		};
	}
}

/**
 * Validate that the database has reset$ observable.
 * Throws synchronously if missing (before any async operations).
 */
function validateResetObservable(storeDB: RxDatabase): void {
	const reset$ = (storeDB as any).reset$;
	if (!reset$) {
		throw new Error('Database does not have reset$ observable (reset-collection plugin missing?)');
	}
}

/**
 * Cancel all queries and replications for a collection.
 * This calls onCollectionReset which deregisters and cancels everything.
 * Awaits completion of all cancellations.
 */
async function cancelCollectionOperations(
	manager: Manager<any>,
	collectionName: string
): Promise<void> {
	const collection = manager.localDB.collections[collectionName];
	if (collection) {
		// onCollectionReset deregisters queries and replications for the collection
		// Each query/replication's cancel() will abort its AbortController
		// Await completion to ensure all cancellations are finished
		await manager.onCollectionReset(collection);
	}
}

/**
 * Remove both store and sync collections for a given collection name.
 * Removes sync first to prevent sync operations during store removal.
 */
async function removeCollections(
	storeDB: RxDatabase,
	fastStoreDB: RxDatabase,
	collectionName: string
): Promise<void> {
	// Special case: products have associated variations
	if (collectionName === 'products') {
		// Remove variations first (child collection)
		if (fastStoreDB.collections['variations']) {
			await fastStoreDB.collections['variations'].remove();
		}
		if (storeDB.collections['variations']) {
			await storeDB.collections['variations'].remove();
		}
	}

	// Remove sync collection first (prevents sync during removal)
	if (fastStoreDB.collections[collectionName]) {
		await fastStoreDB.collections[collectionName].remove();
	}

	// Remove store collection
	if (storeDB.collections[collectionName]) {
		await storeDB.collections[collectionName].remove();
	}
}

/**
 * Wait for the reset$ signal indicating the collection has been re-added.
 * The reset-collection plugin handles re-addition automatically.
 *
 * Note: Caller must validate reset$ exists before calling this function.
 */
function waitForReset(
	storeDB: RxDatabase,
	collectionName: string,
	timeout: number
): Promise<RxCollection> {
	const reset$ = (storeDB as any).reset$;

	const resetSignal$ = reset$.pipe(
		filter((collection: RxCollection) => collection.name === collectionName),
		take(1),
		map((collection: RxCollection) => collection)
	);

	const timeoutSignal$ = timer(timeout).pipe(
		map(() => {
			throw new Error(`Timeout waiting for collection reset: ${collectionName}`);
		})
	);

	return firstValueFrom(race(resetSignal$, timeoutSignal$));
}

/**
 * Swap multiple collections atomically.
 * Useful when collections have dependencies (e.g., products + variations).
 */
export async function swapCollections(
	configs: Omit<CollectionSwapConfig, 'collectionName'> & { collectionNames: string[] }
): Promise<CollectionSwapResult[]> {
	const { collectionNames, ...baseConfig } = configs;

	// Swap collections sequentially to avoid race conditions
	const results: CollectionSwapResult[] = [];

	for (const collectionName of collectionNames) {
		const result = await swapCollection({ ...baseConfig, collectionName });
		results.push(result);

		// If one fails, don't continue
		if (!result.success) {
			break;
		}
	}

	return results;
}
