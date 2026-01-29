import { Subject } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import {
	StoreCollections,
	storeCollections,
	SyncCollections,
	syncCollections,
} from '../collections';

import type { RxCollection, RxPlugin } from 'rxdb';

// Import types to augment RxDatabase
import '../types.d';

const resetLogger = getLogger(['wcpos', 'db', 'reset']);

// Track removal counts for debugging
const removalCounts: Record<string, number> = {};

// Track in-progress re-additions to prevent double execution
const pendingReAdditions = new Set<string>();

/**
 * Collections currently being swapped by swapCollections().
 * When a collection is in this set, the reset plugin will re-add it but NOT emit on reset$.
 * The swapCollections function handles the reset$ emission after the swap is complete.
 */
export const swappingCollections = new Set<string>();

/**
 * Set of collection names that this plugin manages.
 * Only these collections will be auto-recreated after removal.
 * Collections created by other plugins (e.g., FlexSearch) are excluded.
 */
const managedStoreCollections = new Set(Object.keys(storeCollections));
const managedSyncCollections = new Set(Object.keys(syncCollections));

/**
 * Check if a collection is managed by this plugin.
 * Returns false for collections created by other plugins (e.g., FlexSearch indexes).
 */
function isManagedCollection(collectionName: string, databaseName: string): boolean {
	if (databaseName.startsWith('fast_store')) {
		return managedSyncCollections.has(collectionName);
	}
	if (databaseName.startsWith('store')) {
		return managedStoreCollections.has(collectionName);
	}
	return false;
}

// Subjects for emitting reset events
const storeReset = new Subject<RxCollection>();
const syncReset = new Subject<RxCollection>();

/**
 * Manually emit a reset event for a collection.
 * Used by swapCollections after swap is complete.
 */
export function emitCollectionReset(collection: RxCollection, databaseName: string): void {
	if (databaseName.startsWith('fast_store')) {
		syncReset.next(collection);
	} else if (databaseName.startsWith('store')) {
		storeReset.next(collection);
	}
}

/**
 * Reset Collection Plugin
 *
 * Automatically re-creates collections after they are removed, enabling
 * fast "wipe and restart" operations without losing the database connection.
 *
 * Features:
 * - Attaches `reset$` observable to databases for subscribers to react
 * - Only manages collections defined in storeCollections/syncCollections
 * - Ignores collections created by other plugins (e.g., FlexSearch indexes)
 *
 * Usage:
 * ```typescript
 * // Subscribe to collection resets
 * database.reset$.pipe(
 *   filter(col => col.name === 'products')
 * ).subscribe(newCollection => {
 *   // Handle new collection reference
 * });
 *
 * // Trigger reset by removing collection
 * await database.collections.products.remove();
 * // Plugin automatically re-adds and emits on reset$
 * ```
 */
export const resetCollectionPlugin: RxPlugin = {
	name: 'reset-collection',
	rxdb: true,
	prototypes: {},
	overwritable: {},
	hooks: {
		createRxDatabase: {
			after: ({ database }) => {
				// Attach reset$ observable based on database type
				if (database.name.startsWith('fast_store')) {
					database.reset$ = syncReset.asObservable();
					resetLogger.debug('Attached reset$ to sync database', {
						context: { database: database.name },
					});
				} else if (database.name.startsWith('store')) {
					database.reset$ = storeReset.asObservable();
					resetLogger.debug('Attached reset$ to store database', {
						context: { database: database.name },
					});
				}
			},
		},
		postCloseRxCollection: {
			/**
			 * Automatically re-add the collection after it's destroyed.
			 * Only handles collections we manage - ignores plugin-created collections.
			 */
			after: async (collection) => {
				const database = collection.database;
				const collectionName = collection.name;

				// Capture stack trace immediately to debug what triggers removal
				const triggerStack = new Error().stack;
				resetLogger.debug('postCloseRxCollection triggered', {
					context: {
						collection: collectionName,
						database: database.name,
						isDestroyed: (collection as any).destroyed,
						trigger: triggerStack?.split('\n').slice(2, 10).join(' | '),
					},
				});

				// Only re-add collections we manage (not FlexSearch, etc.)
				if (!isManagedCollection(collectionName, database.name)) {
					resetLogger.debug('Skipping unmanaged collection', {
						context: { collection: collectionName, database: database.name },
					});
					return;
				}

				// Guard against re-entrance: if we're already re-adding this collection, skip
				const reAddKey = `${database.name}:${collectionName}`;
				if (pendingReAdditions.has(reAddKey)) {
					resetLogger.debug('Skipping re-addition - already in progress', {
						context: { collection: collectionName, database: database.name, reAddKey },
					});
					return;
				}

				resetLogger.debug('Setting pending re-addition flag', {
					context: { reAddKey, pendingCount: pendingReAdditions.size },
				});
				pendingReAdditions.add(reAddKey);

				// Track removal count for debugging
				const key = `${database.name}:${collectionName}`;
				removalCounts[key] = (removalCounts[key] || 0) + 1;
				const removalNumber = removalCounts[key];

				// Capture stack trace to debug double-removal issues
				const stackTrace = new Error().stack;

				// Check if this is a stale collection reference being closed
				// If a DIFFERENT collection instance already exists, this is likely a stale
				// reference from a previous swap, and we shouldn't re-add
				const existingCollection = database.collections[collectionName];
				const isStaleReference = existingCollection && existingCollection !== collection;
				const collectionAlreadyExists =
					!!existingCollection && !(existingCollection as any).destroyed;

				resetLogger.debug('Re-adding collection after removal', {
					context: {
						collection: collectionName,
						database: database.name,
						removalNumber,
						collectionRef: (collection as any)._instanceId || 'unknown',
						isStaleReference,
						collectionAlreadyExists,
						stack: stackTrace?.split('\n').slice(2, 8).join(' | '),
					},
				});

				// If this is a stale reference being closed while a new collection exists, skip
				if (isStaleReference) {
					resetLogger.debug('Skipping re-addition - stale reference, new collection exists', {
						context: { collection: collectionName, database: database.name },
					});
					pendingReAdditions.delete(reAddKey);
					return;
				}

				// If collection already exists and is not destroyed, skip re-addition
				if (collectionAlreadyExists) {
					resetLogger.debug('Collection already exists, skipping re-addition', {
						context: { collection: collectionName, database: database.name },
					});
					pendingReAdditions.delete(reAddKey);
					return;
				}

				try {
					if (database.name.startsWith('fast_store')) {
						const schema = syncCollections[collectionName as keyof SyncCollections];
						if (!schema) {
							resetLogger.error('No schema found for sync collection', {
								showToast: false,
								saveToDb: true,
								context: {
									errorCode: ERROR_CODES.INVALID_CONFIGURATION,
									collection: collectionName,
								},
							});
							return;
						}

						const cols = await database.addCollections({ [collectionName]: schema });

						// Only emit on reset$ if NOT being swapped by swapCollections
						// (swapCollections handles emission after swap completes)
						if (!swappingCollections.has(collectionName)) {
							syncReset.next(cols[collectionName]);
							resetLogger.debug('Sync collection re-added and emitted reset$', {
								context: { collection: collectionName },
							});
						} else {
							resetLogger.debug('Sync collection re-added (no emit - in swap)', {
								context: { collection: collectionName },
							});
						}
					} else if (database.name.startsWith('store')) {
						const schema = storeCollections[collectionName as keyof StoreCollections];
						if (!schema) {
							resetLogger.error('No schema found for store collection', {
								showToast: false,
								saveToDb: true,
								context: {
									errorCode: ERROR_CODES.INVALID_CONFIGURATION,
									collection: collectionName,
								},
							});
							return;
						}

						const cols = await database.addCollections({ [collectionName]: schema });

						// Only emit on reset$ if NOT being swapped by swapCollections
						// (swapCollections handles emission after swap completes)
						if (!swappingCollections.has(collectionName)) {
							storeReset.next(cols[collectionName]);
							resetLogger.debug('Store collection re-added and emitted reset$', {
								context: { collection: collectionName },
							});
						} else {
							resetLogger.debug('Store collection re-added (no emit - in swap)', {
								context: { collection: collectionName },
							});
						}
					}
				} catch (error: any) {
					resetLogger.error('Failed to re-add collection', {
						showToast: true,
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.DB_UPSERT_FAILED,
							collection: collectionName,
							database: database.name,
							error: error.message,
						},
					});
				} finally {
					// Clear the pending flag after completion (success or failure)
					resetLogger.debug('Clearing pending re-addition flag', {
						context: { reAddKey, pendingCount: pendingReAdditions.size - 1 },
					});
					pendingReAdditions.delete(reAddKey);
				}
			},
		},
	},
};
