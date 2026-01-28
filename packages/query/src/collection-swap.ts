import { firstValueFrom, race, timer } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';
import { emitCollectionReset, swappingCollections } from '@wcpos/database/plugins/reset-collection';

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
	/** Name of the collection that was swapped */
	collectionName: string;
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

		// Step 1: Validate that reset$ is available on both databases
		validateResetObservable(storeDB);
		validateResetObservable(fastStoreDB);

		// Step 2: Mark collection as being swapped
		// This suppresses reset$ emissions from the plugin during swap
		swappingCollections.add(collectionName);
		swapLogger.debug('Added to swappingCollections', { context: { collectionName } });

		// Step 3: Cancel all queries and replications for this collection
		// This triggers AbortController.abort() for in-flight requests
		await cancelCollectionOperations(manager, collectionName);

		// Step 4: Remove collections (sync first, then store)
		// The reset-collection plugin will re-add them but NOT emit reset$ (suppressed)
		await removeCollections(storeDB, fastStoreDB, collectionName);

		// Step 5: Wait for collections to be re-added by polling
		await waitForCollectionToExist(storeDB, collectionName, timeout);
		await waitForCollectionToExist(fastStoreDB, collectionName, timeout);

		// Step 6: Wait for phantom removals to settle
		// There's an unknown trigger causing extra postCloseRxCollection events during store removal
		// This delay lets those complete before we emit
		await new Promise((resolve) => setTimeout(resolve, 50));
		
		// Step 7: Get the LATEST collection reference after phantom removals settle
		const finalStoreCollection = await waitForCollectionToExist(storeDB, collectionName, timeout);
		
		// Step 8: Remove from swappingCollections BEFORE emitting
		swappingCollections.delete(collectionName);
		swapLogger.debug('Removed from swappingCollections', { context: { collectionName } });

		// Step 9: Emit reset$ for STORE collection only (this triggers query re-registration)
		// We only need to emit for store since that's what queries use
		emitCollectionReset(finalStoreCollection, storeDB.name);
		swapLogger.debug('Emitted reset$ for store collection', { context: { collectionName } });

		const duration = performance.now() - startTime;

		swapLogger.info(`Collection swap complete: ${collectionName}`, {
			context: { collectionName, duration },
		});

		return {
			success: true,
			duration,
			collection: finalStoreCollection,
			collectionName,
		};
	} catch (error: any) {
		const duration = performance.now() - startTime;

		// Make sure to remove from swappingCollections on error
		swappingCollections.delete(collectionName);

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
			collectionName,
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

// Track removal calls for debugging
const removalCallCounts: Record<string, number> = {};

/**
 * Remove both store and sync collections for a given collection name.
 * Removes sync first to prevent sync operations during store removal.
 *
 * Note: If you need to remove related collections (e.g., products + variations),
 * use swapCollections() with both collection names rather than relying on
 * special handling here. This avoids double-removal issues.
 */
async function removeCollections(
	storeDB: RxDatabase,
	fastStoreDB: RxDatabase,
	collectionName: string
): Promise<void> {
	// Track removal calls
	removalCallCounts[collectionName] = (removalCallCounts[collectionName] || 0) + 1;
	const callNumber = removalCallCounts[collectionName];

	swapLogger.debug(`removeCollections called (call #${callNumber})`, {
		context: {
			collectionName,
			callNumber,
			hasSyncCollection: !!fastStoreDB.collections[collectionName],
			hasStoreCollection: !!storeDB.collections[collectionName],
		},
	});

	// Remove sync collection first (prevents sync during removal)
	if (fastStoreDB.collections[collectionName]) {
		swapLogger.debug('Removing sync collection', { context: { collectionName } });
		await fastStoreDB.collections[collectionName].remove();
		swapLogger.debug('Sync collection removed', { context: { collectionName } });
	}

	// Remove store collection
	if (storeDB.collections[collectionName]) {
		swapLogger.debug('Removing store collection', { context: { collectionName } });
		await storeDB.collections[collectionName].remove();
		swapLogger.debug('Store collection removed', { context: { collectionName } });
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
 * Wait for a collection to exist in the database by polling.
 * Used when reset$ emissions are suppressed during swap operations.
 */
async function waitForCollectionToExist(
	database: RxDatabase,
	collectionName: string,
	timeout: number
): Promise<RxCollection> {
	const startTime = Date.now();
	const pollInterval = 10; // Check every 10ms

	while (Date.now() - startTime < timeout) {
		const collection = database.collections[collectionName];
		if (collection && !(collection as any).destroyed) {
			return collection;
		}
		await new Promise((resolve) => setTimeout(resolve, pollInterval));
	}

	throw new Error(`Timeout waiting for collection to exist: ${collectionName} in ${database.name}`);
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
