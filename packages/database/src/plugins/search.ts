import get from 'lodash/get';
import { addFulltextSearch } from 'rxdb-premium/plugins/flexsearch';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import type { RxCollection, RxPlugin } from 'rxdb';
import type { FlexSearchInstance } from '../types.d';

const searchLogger = getLogger(['wcpos', 'db', 'search']);

/**
 * Maximum number of locale-specific search instances to keep in memory.
 * Older locales are evicted when this limit is exceeded (LRU strategy).
 */
const MAX_CACHED_LOCALES = 3;

/**
 * Normalize locale to 2-character code.
 */
function normalizeLocale(locale: string): string {
	return locale.slice(0, 2).toLowerCase();
}

/**
 * Update LRU tracking - move locale to end (most recently used).
 */
function touchLRU(collection: RxCollection, locale: string): void {
	if (!collection._localeLRU) {
		collection._localeLRU = [];
	}

	// Remove if exists
	const index = collection._localeLRU.indexOf(locale);
	if (index > -1) {
		collection._localeLRU.splice(index, 1);
	}

	// Add to end (most recently used)
	collection._localeLRU.push(locale);
}

/**
 * Evict least recently used locale if over limit.
 */
async function evictLRUIfNeeded(collection: RxCollection): Promise<void> {
	if (!collection._localeLRU || !collection._searchInstances) {
		return;
	}

	while (
		collection._localeLRU.length > MAX_CACHED_LOCALES &&
		collection._searchInstances.size > MAX_CACHED_LOCALES
	) {
		const oldestLocale = collection._localeLRU.shift();
		if (oldestLocale && collection._searchInstances.has(oldestLocale)) {
			searchLogger.debug('Evicting LRU search instance', {
				context: { collection: collection.name, locale: oldestLocale },
			});

			const instance = collection._searchInstances.get(oldestLocale);
			collection._searchInstances.delete(oldestLocale);

			// Destroy the search collection
			if (instance?.collection && typeof instance.collection.destroy === 'function') {
				try {
					await instance.collection.destroy();
				} catch (error: any) {
					searchLogger.warn('Failed to destroy evicted search instance', {
						context: {
							collection: collection.name,
							locale: oldestLocale,
							error: error.message,
						},
					});
				}
			}
		}
	}
}

/**
 * Create a new FlexSearch instance for a collection and locale.
 * If a FlexSearch collection already exists (e.g., after main collection reset),
 * it will be destroyed first to avoid DB3 "collection already exists" error.
 */
async function createSearchInstance(
	collection: RxCollection,
	locale: string
): Promise<FlexSearchInstance> {
	const searchFields = collection.options?.searchFields;
	// FlexSearch appends _flexsearch to the identifier (note: underscore, not hyphen)
	const searchCollectionName = `${collection.name}-search-${locale}_flexsearch`;
	const database = collection.database;

	searchLogger.debug('Creating search instance', {
		context: {
			collection: collection.name,
			locale,
			fields: searchFields,
		},
	});

	// Check if FlexSearch collection already exists (can happen after main collection reset)
	// If so, remove it first to avoid DB3 error
	if (database.collections[searchCollectionName]) {
		searchLogger.debug('FlexSearch collection already exists, removing first', {
			context: { searchCollection: searchCollectionName },
		});
		try {
			await database.collections[searchCollectionName].remove();
		} catch (removeError: any) {
			searchLogger.warn('Failed to remove existing FlexSearch collection', {
				context: {
					searchCollection: searchCollectionName,
					error: removeError.message,
				},
			});
		}
	}

	const searchInstance = await addFulltextSearch({
		identifier: `${collection.name}-search-${locale}`,
		collection,
		docToString: (doc: any) => {
			// Fields can be nested, so we use lodash get to access them
			return searchFields.map((field: string) => get(doc, field) || '').join(' ');
		},
		initialization: 'lazy',
		indexOptions: {
			preset: 'performance',
			tokenize: 'forward',
			language: locale,
		},
	});

	searchLogger.debug('Search instance created successfully', {
		context: { collection: collection.name, locale },
	});

	return searchInstance as FlexSearchInstance;
}

/**
 * Attempt to destroy a corrupted search collection by name.
 * Used for recovery when FlexSearch schema has changed.
 */
async function destroySearchCollection(collection: RxCollection, locale: string): Promise<boolean> {
	// FlexSearch appends _flexsearch to the identifier (note: underscore, not hyphen)
	const searchCollectionName = `${collection.name}-search-${locale}_flexsearch`;
	const database = collection.database;

	searchLogger.debug('Attempting to destroy search collection', {
		context: { searchCollection: searchCollectionName },
	});

	try {
		// Check if the collection exists in the database
		const searchCollection = database.collections[searchCollectionName];
		if (searchCollection) {
			await searchCollection.remove();
			searchLogger.info('Destroyed corrupted search collection', {
				context: { searchCollection: searchCollectionName },
			});
			return true;
		}
	} catch (error: any) {
		searchLogger.warn('Could not destroy search collection via database', {
			context: { searchCollection: searchCollectionName, error: error.message },
		});
	}

	return false;
}

/**
 * Search Plugin for RxDB
 *
 * Provides full-text search capabilities using FlexSearch with:
 * - Per-locale search instances (different tokenization rules)
 * - LRU cache to limit memory usage (max 3 locales)
 * - Error recovery with automatic recreation on failure
 * - Lazy initialization
 *
 * Usage:
 * ```typescript
 * // Initialize search for a locale
 * const searchInstance = await collection.initSearch('en');
 *
 * // Or set locale and search
 * await collection.setLocale('en');
 * const results = await collection.search('blue shirt');
 *
 * // Recovery: recreate corrupted search index
 * await collection.recreateSearch('en');
 * ```
 */
export const searchPlugin: RxPlugin = {
	name: 'search',
	rxdb: true,
	prototypes: {
		RxCollection(proto: any) {
			/**
			 * Initializes or retrieves a FlexSearch instance for a given locale.
			 * Uses LRU caching to limit memory usage.
			 *
			 * @param locale - The locale for search (e.g., 'en', 'de', 'zh')
			 * @returns The FlexSearch instance, or null if no searchFields configured
			 */
			proto.initSearch = async function (locale = 'en'): Promise<FlexSearchInstance | null> {
				// Check if collection has searchFields configured
				if (!Array.isArray(this.options?.searchFields)) {
					return null;
				}

				locale = normalizeLocale(locale);

				// Initialize maps if needed
				if (!this._searchInstances) {
					this._searchInstances = new Map<string, FlexSearchInstance>();
				}
				if (!this._searchPromises) {
					this._searchPromises = new Map<string, Promise<FlexSearchInstance>>();
				}

				// Return existing instance
				if (this._searchInstances.has(locale)) {
					touchLRU(this, locale);
					return this._searchInstances.get(locale)!;
				}

				// Return pending promise if initialization is in progress
				if (this._searchPromises.has(locale)) {
					return this._searchPromises.get(locale)!;
				}

				// Create initialization promise
				const searchPromise = (async (): Promise<FlexSearchInstance> => {
					try {
						const searchInstance = await createSearchInstance(this, locale);

						// Store instance and update LRU
						this._searchInstances.set(locale, searchInstance);
						this._searchPromises.delete(locale);
						touchLRU(this, locale);

						// Evict old instances if over limit
						await evictLRUIfNeeded(this);

						return searchInstance;
					} catch (error: any) {
						this._searchPromises.delete(locale);

						searchLogger.error('Failed to initialize search', {
							showToast: false,
							saveToDb: true,
							context: {
								errorCode: ERROR_CODES.INVALID_CONFIGURATION,
								collection: this.name,
								locale,
								error: error.message,
							},
						});

						// Attempt recovery: destroy corrupted collection and retry once
						searchLogger.info('Attempting search recovery', {
							context: { collection: this.name, locale },
						});

						const destroyed = await destroySearchCollection(this, locale);
						if (destroyed) {
							try {
								const searchInstance = await createSearchInstance(this, locale);
								this._searchInstances.set(locale, searchInstance);
								touchLRU(this, locale);
								await evictLRUIfNeeded(this);

								searchLogger.info('Search recovery successful', {
									context: { collection: this.name, locale },
								});

								return searchInstance;
							} catch (retryError: any) {
								searchLogger.error('Search recovery failed', {
									showToast: true,
									saveToDb: true,
									context: {
										errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
										collection: this.name,
										locale,
										error: retryError.message,
									},
								});
							}
						}

						throw error;
					}
				})();

				// Store promise for deduplication
				this._searchPromises.set(locale, searchPromise);

				// Register cleanup handler (once per collection)
				if (!this._cleanupRegistered) {
					this._cleanupRegistered = true;

					this.onClose.push(async () => {
						// Skip cleanup if this collection instance is already destroyed
						// This can happen during collection swap where the old collection's
						// onClose fires after the new collection is already in use
						const isDestroyed = (this as any).destroyed;

						searchLogger.debug('Cleaning up search instances', {
							context: {
								collection: this.name,
								locales: this._searchInstances ? Array.from(this._searchInstances.keys()) : [],
								isCollectionDestroyed: isDestroyed,
							},
						});

						if (isDestroyed) {
							searchLogger.debug('Skipping search cleanup - collection already destroyed', {
								context: { collection: this.name },
							});
							// Just clear the references, don't try to destroy anything
							this._searchInstances?.clear();
							this._searchPromises?.clear();
							if (this._localeLRU) {
								this._localeLRU = [];
							}
							return;
						}

						// Destroy all search instances
						// NOTE: We only destroy FlexSearch collections (ending in _flexsearch)
						// to avoid accidentally destroying other collections
						if (this._searchInstances) {
							for (const [loc, searchInstance] of this._searchInstances.entries()) {
								// Diagnostic: what does searchInstance actually contain?
								const collectionKeys = searchInstance?.collection
									? Object.keys(searchInstance.collection)
									: [];
								const collectionProto = searchInstance?.collection
									? Object.getOwnPropertyNames(Object.getPrototypeOf(searchInstance.collection))
									: [];
								searchLogger.debug('Inspecting search instance for cleanup', {
									context: {
										mainCollection: this.name,
										locale: loc,
										hasSearchInstance: !!searchInstance,
										hasCollection: !!searchInstance?.collection,
										collectionName: searchInstance?.collection?.name || 'none',
										hasDestroyFn: typeof searchInstance?.collection?.destroy === 'function',
										collectionType: searchInstance?.collection?.constructor?.name || 'unknown',
										collectionKeys: collectionKeys.slice(0, 10),
										protoMethods: collectionProto.slice(0, 10),
									},
								});

								if (
									searchInstance.collection &&
									typeof searchInstance.collection.destroy === 'function'
								) {
									// Log what we're about to destroy
									const searchCollectionName = searchInstance.collection?.name || 'unknown';
									const searchCollectionDb = searchInstance.collection?.database?.name || 'unknown';
									const isFlexSearchCollection = searchCollectionName.endsWith('_flexsearch');
									const isAlreadyDestroyed = (searchInstance.collection as any)?.destroyed;

									searchLogger.debug('About to destroy search instance collection', {
										context: {
											mainCollection: this.name,
											locale: loc,
											searchCollectionName,
											searchCollectionDb,
											isFlexSearchCollection,
											isAlreadyDestroyed,
										},
									});

									// Only destroy if it's a FlexSearch collection and not already destroyed
									if (!isFlexSearchCollection) {
										searchLogger.warn('Skipping non-FlexSearch collection destruction', {
											context: {
												mainCollection: this.name,
												locale: loc,
												searchCollectionName,
												expectedPattern: `${this.name}-search-${loc}_flexsearch`,
											},
										});
										continue;
									}

									if (isAlreadyDestroyed) {
										searchLogger.debug('Skipping already-destroyed FlexSearch collection', {
											context: { mainCollection: this.name, locale: loc },
										});
										continue;
									}

									try {
										await searchInstance.collection.destroy();
										searchLogger.debug('Search instance collection destroyed', {
											context: { mainCollection: this.name, locale: loc },
										});
									} catch (error: any) {
										searchLogger.warn('Error destroying search instance on cleanup', {
											context: {
												collection: this.name,
												locale: loc,
												error: error.message,
											},
										});
									}
								}
							}
							this._searchInstances.clear();
							searchLogger.debug('Search instances map cleared', {
								context: { collection: this.name },
							});
						}

						// Clear pending promises
						if (this._searchPromises) {
							this._searchPromises.clear();
						}

						// Clear LRU tracking
						if (this._localeLRU) {
							this._localeLRU = [];
						}
					});
				}

				return searchPromise;
			};

			/**
			 * Sets the active locale for searching.
			 * Initializes the search instance if not already done.
			 *
			 * @param locale - The locale to set as active
			 * @returns The FlexSearch instance for the locale
			 */
			proto.setLocale = async function (locale: string): Promise<FlexSearchInstance | null> {
				const searchInstance = await this.initSearch(locale);
				this._activeLocale = normalizeLocale(locale);
				return searchInstance;
			};

			/**
			 * Performs a search using the active locale's FlexSearch instance.
			 *
			 * @param query - The search query
			 * @returns Array of matching document primary keys
			 * @throws If setLocale() hasn't been called
			 */
			proto.search = async function (query: string): Promise<string[]> {
				if (!this._activeLocale) {
					throw new Error('Search locale not initialized. Call setLocale(locale) first.');
				}

				const searchInstance = this._searchInstances?.get(this._activeLocale);
				if (!searchInstance) {
					throw new Error(`Search instance for locale '${this._activeLocale}' is not initialized.`);
				}

				touchLRU(this, this._activeLocale);
				return searchInstance.search(query);
			};

			/**
			 * Recreate the search index for a locale.
			 * Destroys the existing search collection and creates a fresh one.
			 * Useful for recovering from schema migration issues.
			 *
			 * @param locale - The locale to recreate (defaults to active locale)
			 * @returns The new FlexSearch instance
			 */
			proto.recreateSearch = async function (locale?: string): Promise<FlexSearchInstance | null> {
				// Check if collection has searchFields configured
				if (!Array.isArray(this.options?.searchFields)) {
					return null;
				}

				locale = normalizeLocale(locale || this._activeLocale || 'en');

				searchLogger.info('Recreating search index', {
					context: { collection: this.name, locale },
				});

				// Remove existing instance from cache
				if (this._searchInstances?.has(locale)) {
					const oldInstance = this._searchInstances.get(locale);
					this._searchInstances.delete(locale);

					// Destroy the old search collection
					if (oldInstance?.collection && typeof oldInstance.collection.destroy === 'function') {
						try {
							await oldInstance.collection.destroy();
						} catch (error: any) {
							searchLogger.warn('Error destroying old search instance', {
								context: { collection: this.name, locale, error: error.message },
							});
						}
					}
				}

				// Also try to destroy any orphaned search collection
				await destroySearchCollection(this, locale);

				// Remove from LRU tracking
				if (this._localeLRU) {
					const index = this._localeLRU.indexOf(locale);
					if (index > -1) {
						this._localeLRU.splice(index, 1);
					}
				}

				// Clear any pending promise
				this._searchPromises?.delete(locale);

				// Create fresh instance
				try {
					const searchInstance = await createSearchInstance(this, locale);

					// Store and track
					if (!this._searchInstances) {
						this._searchInstances = new Map();
					}
					this._searchInstances.set(locale, searchInstance);
					touchLRU(this, locale);
					await evictLRUIfNeeded(this);

					searchLogger.info('Search index recreated successfully', {
						context: { collection: this.name, locale },
					});

					return searchInstance;
				} catch (error: any) {
					searchLogger.error('Failed to recreate search index', {
						showToast: true,
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
							collection: this.name,
							locale,
							error: error.message,
						},
					});
					throw error;
				}
			};
		},
	},
	overwritable: {},
};
