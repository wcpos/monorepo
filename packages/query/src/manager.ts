import cloneDeep from 'lodash/cloneDeep';
import forEach from 'lodash/forEach';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { CollectionReplicationState } from './collection-replication-state';
import allHooks from './hooks';
import { QueryReplicationState } from './query-replication-state';
import { Query } from './query-state';
import { Registry } from './registry';
import { RelationalQuery } from './relational-query-state';
import { SubscribableBase } from './subscribable-base';
import { buildEndpointWithParams } from './utils';

import type { QueryParams } from './query-state';
import type { RxCollection, RxDatabase } from 'rxdb';

const queryLogger = getLogger(['wcpos', 'query', 'manager']);

/**
 *
 */
export interface RegisterQueryConfig {
	queryKeys: (string | number | object)[];
	collectionName: string;
	initialParams?: QueryParams;
	endpoint?: string;
	greedy?: boolean;
}

/**
 *
 */
export class Manager<TDatabase extends RxDatabase> extends SubscribableBase {
	public readonly queryStates: Registry<string, Query<RxCollection>>;
	public readonly replicationStates: Registry<
		string,
		CollectionReplicationState<RxCollection> | QueryReplicationState<RxCollection>
	>;

	/**
	 * Each queryKey should have one collection replication and one query replication
	 */
	public readonly activeCollectionReplications: Registry<
		string,
		CollectionReplicationState<RxCollection>
	>;
	public readonly activeQueryReplications: Registry<string, QueryReplicationState<RxCollection>>;

	/**
	 * Enforce singleton pattern
	 */
	// private static instanceCount = 0;
	// private instanceId: number;
	private static instance: Manager<any>;

	private constructor(
		public localDB: TDatabase,
		public fastLocalDB,
		public httpClient,
		public locale: string
	) {
		super();
		// Manager.instanceCount++;
		// this.instanceId = Manager.instanceCount;
		// console.log(`Manager instance created with ID: ${this.instanceId}`, {
		// 	localDB,
		// 	httpClient,
		// 	locale,
		// });

		this.queryStates = new Registry();
		this.replicationStates = new Registry();
		this.activeCollectionReplications = new Registry();
		this.activeQueryReplications = new Registry();

		/**
		 * Collection reset handling:
		 * - Cleanup is handled via collection.onRemove (see registerCollectionReplication)
		 * - Re-registration is handled by React hooks (useQuery, useRelationalQuery) subscribing to reset$
		 *
		 * Note: We previously considered subscribing to reset$ here, but it's redundant because:
		 * 1. collection.onRemove fires first and calls onCollectionReset() for cleanup
		 * 2. React hooks subscribe to reset$ to re-register queries when collections are recreated
		 */

		/**
		 * Subscribe to localDB to detect if db is destroyed
		 */
		this.localDB.onClose.push(() => {
			void this.cancel().catch((error) =>
				queryLogger.error('Manager cancel on db close failed', { context: { error } })
			);
		});
	}

	public static getInstance<TDatabase extends RxDatabase>(
		localDB: TDatabase,
		fastLocalDB,
		httpClient,
		locale: string = 'en'
	) {
		// Check if instance exists and dependencies are the same
		if (
			Manager.instance &&
			Manager.instance.localDB === localDB &&
			Manager.instance.fastLocalDB === fastLocalDB &&
			// Manager.instance.httpClient === httpClient && // @TODO - look into this
			Manager.instance.locale === locale
		) {
			return Manager.instance as Manager<TDatabase>;
		}

		// If instance exists but dependencies have changed, cancel the existing instance
		if (Manager.instance) {
			void Manager.instance
				.cancel()
				.catch((error) =>
					queryLogger.error('Previous Manager instance cancel failed', { context: { error } })
				);
		}

		// Create a new instance
		Manager.instance = new Manager(localDB, fastLocalDB, httpClient, locale);
		return Manager.instance as Manager<TDatabase>;
	}

	stringify(params: any): string | undefined {
		try {
			return JSON.stringify(params);
		} catch (error) {
			queryLogger.error(`Failed to serialize query key: ${error}`, {
				showToast: true,
				saveToDb: true,
				context: { errorCode: ERROR_CODES.INVALID_REQUEST_FORMAT },
			});
		}
	}

	hasQuery(queryKeys: (string | number | object)[]): boolean {
		const key = this.stringify(queryKeys);
		return this.queryStates.has(key);
	}

	registerQuery({
		queryKeys,
		collectionName,
		initialParams,
		greedy,
		infiniteScroll,
		pageSize,
		...args
	}: RegisterQueryConfig) {
		const key = this.stringify(queryKeys);
		const endpoint = args.endpoint || collectionName;
		const hooks = allHooks[collectionName] || {};

		if (this.queryStates.has(key)) {
			const existingQuery = this.queryStates.get(key);
			const existingCollection = existingQuery?.collection;
			const currentCollection = this.getCollection(collectionName);
			const isSameCollection = existingCollection === currentCollection;
			const isCollectionDestroyed = (existingCollection as any)?.destroyed;

			queryLogger.debug('registerQuery: query already exists', {
				context: {
					key,
					collectionName,
					isSameCollection,
					isCollectionDestroyed,
				},
			});

			// If the existing query's collection is destroyed or different, we need a new query
			if (isCollectionDestroyed || !isSameCollection) {
				queryLogger.debug(
					'registerQuery: existing query has stale collection, removing and re-creating',
					{
						context: { key, collectionName },
					}
				);
				void this.deregisterQuery(key).catch((error) =>
					queryLogger.error('Failed to deregister stale query', {
						context: { key, collectionName, error },
					})
				);
				// Fall through to create new query
			} else {
				return existingQuery;
			}
		}

		const collection = this.getCollection(collectionName);

		if (!collection) {
			queryLogger.error('registerQuery: collection not found, cannot register', {
				showToast: false,
				saveToDb: false,
				context: {
					key,
					collectionName,
					availableCollections: Object.keys(this.localDB.collections),
				},
			});
			return undefined;
		}

		queryLogger.debug('Registering new query', {
			context: { key, collectionName, endpoint, greedy, infiniteScroll },
		});

		const queryState = new Query<typeof collection>({
			id: key,
			collection,
			initialParams,
			hooks,
			endpoint,
			greedy,
			locale: this.locale,
			infiniteScroll,
			pageSize,
		});

		this.queryStates.set(key, queryState);
		this.onNewQueryState(queryState);

		return this.queryStates.get(key);
	}

	registerRelationalQuery(
		{
			queryKeys,
			collectionName,
			initialParams,
			greedy,
			infiniteScroll,
			pageSize,
			...args
		}: RegisterQueryConfig,
		childQuery: Query<any>,
		parentLookupQuery: Query<any>
	) {
		const key = this.stringify(queryKeys);
		const endpoint = args.endpoint || collectionName;
		const hooks = allHooks[collectionName] || {};

		if (this.queryStates.has(key)) {
			const existingQuery = this.queryStates.get(key);
			const existingCollection = existingQuery?.collection;
			const currentCollection = this.getCollection(collectionName);
			const isSameCollection = existingCollection === currentCollection;
			const isCollectionDestroyed = (existingCollection as any)?.destroyed;

			queryLogger.debug('registerRelationalQuery: query already exists', {
				context: {
					key,
					collectionName,
					isSameCollection,
					isCollectionDestroyed,
				},
			});

			// If the existing query's collection is destroyed or different, we need a new query
			if (isCollectionDestroyed || !isSameCollection) {
				queryLogger.debug(
					'registerRelationalQuery: existing query has stale collection, removing and re-creating',
					{
						context: { key, collectionName },
					}
				);
				void this.deregisterQuery(key).catch((error) =>
					queryLogger.error('Failed to deregister stale relational query', {
						context: { key, collectionName, error },
					})
				);
				// Fall through to create new query
			} else {
				return existingQuery;
			}
		}

		const collection = this.getCollection(collectionName);

		if (!collection) {
			queryLogger.error('registerRelationalQuery: collection not found, cannot register', {
				showToast: false,
				saveToDb: false,
				context: {
					key,
					collectionName,
					availableCollections: Object.keys(this.localDB.collections),
				},
			});
			return undefined;
		}

		queryLogger.debug('Registering new relational query', {
			context: { key, collectionName, endpoint, greedy, infiniteScroll },
		});

		const queryState = new RelationalQuery<typeof collection>(
			{
				id: key,
				collection,
				initialParams,
				hooks,
				endpoint,
				greedy,
				locale: this.locale,
				infiniteScroll,
				pageSize,
			},
			childQuery,
			parentLookupQuery
		);

		this.queryStates.set(key, queryState);
		this.onNewQueryState(queryState);

		return this.queryStates.get(key);
	}

	getCollection(collectionName: string) {
		if (!this.localDB.collections[collectionName]) {
			queryLogger.error(`Collection with name: ${collectionName} not found.`, {
				showToast: true,
				saveToDb: true,
				context: { errorCode: ERROR_CODES.INVALID_CONFIGURATION, collectionName },
			});
		}
		return this.localDB.collections[collectionName];
	}

	getSyncCollection(collectionName: string) {
		// Note: sync collection might not exist during collection swap
		// The caller should handle undefined gracefully
		return this.fastLocalDB.collections[collectionName];
	}

	getQuery(queryKeys: (string | number | object)[]) {
		const key = this.stringify(queryKeys);
		const query = this.queryStates.get(key);

		if (!query) {
			queryLogger.error(`Query with key: ${key} not found.`, {
				showToast: true,
				saveToDb: true,
				context: { errorCode: ERROR_CODES.RECORD_NOT_FOUND, queryKey: key },
			});
		}

		return query;
	}

	async deregisterQuery(key: string): Promise<void> {
		const query = this.queryStates.get(key);
		if (query) {
			queryLogger.debug('Deregistering query', {
				context: { key, collection: query.collection.name },
			});

			this.queryStates.delete(key);
			this.activeCollectionReplications.delete(key);
			this.activeQueryReplications.delete(key);

			await query.cancel();
		}
	}

	/**
	 * Called when a collection is reset/removed.
	 * Deregisters and cancels all queries and replications for the collection.
	 * Returns a Promise that resolves when all cancellations are complete.
	 *
	 * IMPORTANT: Uses reference equality (===) to only clean up queries/replications
	 * that reference THIS specific collection instance, not newer collections with
	 * the same name. This prevents race conditions during collection swap.
	 */
	async onCollectionReset(collection): Promise<void> {
		// Count affected items for logging (by reference, not name)
		let queryCount = 0;
		let replicationCount = 0;
		const collectionDestroyed = (collection as any)?.destroyed;

		// Get the current collection from the database for comparison
		const currentCollection = this.localDB.collections[collection.name];
		const isSameAsCurrent = collection === currentCollection;

		this.queryStates.forEach((q) => {
			if (q.collection === collection) queryCount++;
		});
		this.replicationStates.forEach((r) => {
			if (r.collection === collection) replicationCount++;
		});

		// Capture stack trace for debugging
		const stackTrace = new Error().stack;

		queryLogger.debug('Collection reset - cancelling operations', {
			context: {
				collection: collection.name,
				queries: queryCount,
				replications: replicationCount,
				collectionDestroyed,
				isSameAsCurrent,
				stack: stackTrace?.split('\n').slice(2, 6).join(' | '),
			},
		});

		const cancelPromises: Promise<void>[] = [];

		// Cancel all replication states for THIS collection (by reference)
		this.replicationStates.forEach((replication, endpoint) => {
			if (replication.collection === collection) {
				cancelPromises.push(this.deregisterReplication(endpoint));
			}
		});

		// Cancel all query states for THIS collection (by reference)
		this.queryStates.forEach((query, key) => {
			if (query.collection === collection) {
				cancelPromises.push(this.deregisterQuery(key));
			}
		});

		await Promise.all(cancelPromises);

		queryLogger.debug('Collection reset complete', {
			context: { collection: collection.name },
		});
	}

	/**
	 * Tasks to perform when a new query state is registered
	 * - register a new collection replication state
	 * - start the collection replication
	 * - subscribe to the query params and register a new query replication state
	 */
	onNewQueryState(queryState: Query<RxCollection>) {
		const { collection, endpoint } = queryState;
		const collectionReplication = this.registerCollectionReplication({ collection, endpoint });

		// Guard: if sync collection isn't ready yet, skip replication setup
		// This can happen during collection swap - replication will be set up on next query registration
		if (!collectionReplication) {
			queryLogger.debug('Skipping replication setup - collection replication not ready', {
				context: { queryId: queryState.id, collection: collection.name },
			});
			return;
		}

		this.activeCollectionReplications.set(queryState.id, collectionReplication);
		collectionReplication.start();

		/**
		 * Add internal subscriptions to the query state
		 * @TODO - should this be part of the events system?
		 */
		queryState.addSub(
			'query-replication',
			/**
			 * Subscribe to query params and register a new replication state for the query
			 */
			queryState.rxQuery$.subscribe((rxQuery) => {
				const params = cloneDeep(rxQuery?.mangoQuery || {});
				// we need to get the search term from the rxQuery, because it's not part of the mango query params
				// we'll add it to the select object just in case the hook needs it
				if (rxQuery?.other.search || rxQuery?.other.relationalSearch) {
					params.selector = params.selector || {};
					params.selector.search =
						rxQuery.other.search?.searchTerm || rxQuery.other.relationalSearch?.searchTerm;
				}
				// @NOTE - this.getApiQueryParams converts { selector: { id: { $in: [1, 2, 3] } } } to { include: [1, 2, 3] }
				let apiQueryParams = this.getApiQueryParams(params);
				const hooks = allHooks[queryState.collection.name] || {};
				if (hooks?.filterApiQueryParams) {
					apiQueryParams = hooks.filterApiQueryParams(apiQueryParams, params);
				}
				const queryEndpoint = buildEndpointWithParams(endpoint, apiQueryParams);
				const queryReplication = this.registerQueryReplication({
					collectionReplication,
					collection,
					queryEndpoint,
					greedy: queryState.greedy,
				});
				// if we're replacing an existing query replication, maybe pause it
				if (this.activeQueryReplications.has(queryState.id)) {
					this.maybePauseQueryReplications(queryState);
				}
				this.activeQueryReplications.set(queryState.id, queryReplication);

				queryReplication.start();
			})
		);
	}

	/**
	 * There is one replication state per collection
	 */
	registerCollectionReplication({ collection, endpoint }) {
		const existingReplication = this.replicationStates.get(endpoint);
		const syncCollection = this.getSyncCollection(collection.name);

		// Guard: don't create replication if sync collection doesn't exist yet
		// This can happen during collection swap when reset$ emits before all collections are ready
		if (!syncCollection) {
			queryLogger.debug('Skipping replication registration - sync collection not ready', {
				context: { collection: collection.name, endpoint },
			});
			return undefined;
		}

		// Check if existing replication is stale (collection destroyed or different instance)
		const isExistingStale =
			existingReplication instanceof CollectionReplicationState &&
			((existingReplication.collection as any)?.destroyed ||
				existingReplication.collection !== collection);

		if (isExistingStale) {
			queryLogger.debug('Existing replication is stale, creating new one', {
				context: {
					endpoint,
					collection: collection.name,
					existingCollectionDestroyed: (existingReplication.collection as any)?.destroyed,
					isSameCollection: existingReplication.collection === collection,
				},
			});
			// Don't await cancel - let it clean up in background
			existingReplication.cancel();
			this.replicationStates.delete(endpoint);
		}

		if (!this.replicationStates.has(endpoint)) {
			const collectionReplication = new CollectionReplicationState({
				httpClient: this.httpClient,
				collection,
				syncCollection,
				endpoint,
			});

			// Register cleanup when THIS specific collection is removed
			// Uses reference equality so it only cleans up queries for THIS collection,
			// not newer collections with the same name
			collection.onRemove.push(() => this.onCollectionReset(collection));

			this.replicationStates.set(endpoint, collectionReplication);
		}

		return this.replicationStates.get(endpoint);
	}

	/**
	 * There is one replication state per query endpoint
	 */
	registerQueryReplication({ queryEndpoint, collectionReplication, collection, greedy }) {
		const existingReplication = this.replicationStates.get(queryEndpoint);

		// Check if existing replication is stale (collection destroyed or different instance)
		const isExistingStale =
			existingReplication instanceof QueryReplicationState &&
			((existingReplication.collection as any)?.destroyed ||
				existingReplication.collection !== collection);

		if (isExistingStale) {
			queryLogger.debug('Existing query replication is stale, creating new one', {
				context: {
					queryEndpoint,
					collection: collection.name,
					existingCollectionDestroyed: (existingReplication.collection as any)?.destroyed,
					isSameCollection: existingReplication.collection === collection,
				},
			});
			existingReplication.cancel();
			this.replicationStates.delete(queryEndpoint);
		}

		if (!this.replicationStates.has(queryEndpoint)) {
			const queryReplication = new QueryReplicationState({
				httpClient: this.httpClient,
				collectionReplication,
				collection,
				endpoint: queryEndpoint,
				greedy,
			});

			this.replicationStates.set(queryEndpoint, queryReplication);
		}

		return this.replicationStates.get(queryEndpoint);
	}

	/**
	 * Deregister and cancel a replication state.
	 */
	async deregisterReplication(endpoint: string): Promise<void> {
		const replicationState = this.replicationStates.get(endpoint);
		if (replicationState) {
			this.replicationStates.delete(endpoint);
			await replicationState.cancel();
		}
	}

	/**
	 * Ensure replications are set up for all queries for a given collection.
	 * Call this after a collection swap to set up replications that were skipped
	 * because the sync collection wasn't ready yet.
	 */
	ensureReplicationsForCollection(collectionName: string): void {
		const syncCollection = this.getSyncCollection(collectionName);

		// Log all queries in queryStates for debugging
		const allQueries: string[] = [];
		this.queryStates.forEach((q, key) => {
			allQueries.push(`${key}: ${q.collection?.name}`);
		});
		queryLogger.debug('ensureReplicationsForCollection: all queryStates', {
			context: { collectionName, count: allQueries.length, queries: allQueries },
		});

		if (!syncCollection) {
			queryLogger.warn('ensureReplicationsForCollection: sync collection still not ready', {
				context: { collectionName },
			});
			return;
		}

		// Find all queries for this collection that don't have replications
		let foundQueries = 0;
		this.queryStates.forEach((queryState, queryKey) => {
			if (queryState.collection.name !== collectionName) {
				return;
			}
			foundQueries++;

			// Check if this query already has a replication
			if (this.activeCollectionReplications.has(queryKey)) {
				queryLogger.debug('ensureReplicationsForCollection: query already has replication', {
					context: { queryKey, collectionName },
				});
				return;
			}

			// Set up replication for this query
			queryLogger.debug('ensureReplicationsForCollection: setting up replication', {
				context: { queryKey, collectionName },
			});

			// Call onNewQueryState to set up the replication
			this.onNewQueryState(queryState);
		});

		queryLogger.debug('ensureReplicationsForCollection: done', {
			context: { collectionName, foundQueries },
		});
	}

	/**
	 * Get the query params that are used for the API
	 * - @NOTE - the api query params have a different format than the query params
	 * - eg: sort is `orderby` and `order`, and selectors are top level params
	 * - allow hooks to modify the query params
	 */
	getApiQueryParams(queryParams: QueryParams = {}) {
		const sort = queryParams?.sort?.[0];
		const params = {
			orderby: sort ? Object.keys(sort)[0].replace(/^sortable_/, '') : undefined,
			order: sort ? Object.values(sort)[0] : undefined,
			per_page: 10,
		};

		// convert id to include
		if (queryParams?.selector?.id) {
			if (queryParams.selector.id.$in) {
				params.include = queryParams.selector.id.$in;
			} else if (
				typeof queryParams.selector.id === 'number' ||
				typeof queryParams.selector.id === 'string'
			) {
				params.include = queryParams.selector.id;
			}
			delete queryParams.selector.id;
		}

		// pass all other mango query params to the API, except uuid
		if (queryParams?.selector) {
			forEach(queryParams.selector, (value, key) => {
				if (key !== 'uuid') {
					params[key] = value;
				}
			});
		}

		// dates are always GMT
		params.dates_are_gmt = 'true';

		return params;
	}

	/**
	 * When a useQuery is unmounted, we check if we need to pause the query replications
	 * - if there are no more useQuery components for a query, we pause the query replications
	 * - when a new useQuery component is mounted, we resume the query replications
	 * - collection replications are not paused
	 */
	maybePauseQueryReplications(query: Query<RxCollection>) {
		const activeQueryReplication = this.activeQueryReplications.get(query?.id);
		if (!activeQueryReplication || !activeQueryReplication.endpoint) {
			return;
		}
		const activeQueryReplications = this.getActiveQueryReplicationStatesByEndpoint(
			activeQueryReplication.endpoint
		);
		if (activeQueryReplications.length === 1) {
			activeQueryReplication.pause();
		}
	}

	getActiveQueryReplicationStatesByEndpoint(endpoint: string) {
		const matchingStates = [];
		this.activeQueryReplications.forEach((state) => {
			if (state.endpoint === endpoint) {
				matchingStates.push(state);
			}
		});
		return matchingStates;
	}

	/**
	 * Cancel
	 *
	 * Make sure we clean up subscriptions:
	 * - things we subscribe to in this class, also
	 * - complete the observables accessible from this class
	 * - cancel all queries and replications
	 *
	 * @returns Promise that resolves when all cleanup is complete
	 */
	async cancel(): Promise<void> {
		queryLogger.debug('Manager cancelling', {
			context: {
				queries: this.queryStates.size,
				replications: this.replicationStates.size,
			},
		});

		// Cancel base class first (aborts controller, unsubscribes)
		await super.cancel();

		// Cancel all queries in parallel
		const queryPromises: Promise<void>[] = [];
		this.queryStates.forEach((query) => {
			queryPromises.push(query.cancel());
		});

		// Cancel all replications in parallel
		const replicationPromises: Promise<void>[] = [];
		this.replicationStates.forEach((replication) => {
			replicationPromises.push(replication.cancel());
		});

		// Wait for all to complete
		await Promise.all([...queryPromises, ...replicationPromises]);

		queryLogger.debug('Manager cancelled');
	}
}
