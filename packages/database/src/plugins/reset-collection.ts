import type { RxCollection, RxPlugin } from 'rxdb';
import { Subject } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import {
	StoreCollections,
	storeCollections,
	SyncCollections,
	syncCollections,
} from '../collections';

// Import types to augment RxDatabase
import '../types.d';

const resetLogger = getLogger(['wcpos', 'db', 'reset']);

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

				// Only re-add collections we manage (not FlexSearch, etc.)
				if (!isManagedCollection(collectionName, database.name)) {
					resetLogger.debug('Skipping unmanaged collection', {
						context: { collection: collectionName, database: database.name },
					});
					return;
				}

				resetLogger.debug('Re-adding collection after removal', {
					context: { collection: collectionName, database: database.name },
				});

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
						syncReset.next(cols[collectionName]);

						resetLogger.debug('Sync collection re-added successfully', {
							context: { collection: collectionName },
						});
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
						storeReset.next(cols[collectionName]);

						resetLogger.debug('Store collection re-added successfully', {
							context: { collection: collectionName },
						});
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
				}
			},
		},
	},
};
