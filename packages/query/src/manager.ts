import cloneDeep from 'lodash/cloneDeep';
import forEach from 'lodash/forEach';
import { Observable, Subject, Subscription } from 'rxjs';
import { filter, map } from 'rxjs/operators';

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
	 *
	 */
	public readonly subjects = {
		error: new Subject<Error>(),
	};
	readonly error$: Observable<Error> = this.subjects.error.asObservable();

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
		 * Subscribe to localDB to detect if collection is reset
		 * We need to fire the Query State clean up as early as possible, ie: collection.onDestroy,
		 * we can't wait for reset because the collection emits as it's being removed
		 */
		//this.addSub('localDB', this.localDB.reset$.subscribe(this.onCollectionReset.bind(this)));

		/**
		 * Subscribe to localDB to detect if db is destroyed
		 */
		this.localDB.onClose.push(() => this.cancel());
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
			Manager.instance.cancel();
		}

		// Create a new instance
		Manager.instance = new Manager(localDB, fastLocalDB, httpClient, locale);
		return Manager.instance as Manager<TDatabase>;
	}

	stringify(params: any): string | undefined {
		try {
			return JSON.stringify(params);
		} catch (error) {
			this.subjects.error.next(new Error(`Failed to serialize query key: ${error}`));
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

		if (!this.queryStates.has(key)) {
			const collection = this.getCollection(collectionName);
			if (collection) {
				const queryState = new Query<typeof collection>({
					id: key,
					collection,
					initialParams,
					hooks,
					endpoint,
					errorSubject: this.subjects.error,
					greedy,
					locale: this.locale,
					infiniteScroll,
					pageSize,
				});

				this.queryStates.set(key, queryState);
				this.onNewQueryState(queryState);
			}
		}

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

		if (!this.queryStates.has(key)) {
			const collection = this.getCollection(collectionName);
			if (collection) {
				const queryState = new RelationalQuery<typeof collection>(
					{
						id: key,
						collection,
						initialParams,
						hooks,
						endpoint,
						errorSubject: this.subjects.error,
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
			}
		}

		return this.queryStates.get(key);
	}

	getCollection(collectionName: string) {
		if (!this.localDB.collections[collectionName]) {
			this.subjects.error.next(new Error(`Collection with name: ${collectionName} not found.`));
		}
		return this.localDB.collections[collectionName];
	}

	getSyncCollection(collectionName: string) {
		if (!this.fastLocalDB.collections[collectionName]) {
			this.subjects.error.next(
				new Error(`Sync collection with name: ${collectionName} not found.`)
			);
		}
		return this.fastLocalDB.collections[collectionName];
	}

	getQuery(queryKeys: (string | number | object)[]) {
		const key = this.stringify(queryKeys);
		const query = this.queryStates.get(key);

		if (!query) {
			this.subjects.error.next(new Error(`Query with key: ${key} not found.`));
		}

		return query;
	}

	deregisterQuery(key: string): void {
		const query = this.queryStates.get(key);
		if (query) {
			this.queryStates.delete(key);
			this.activeCollectionReplications.delete(key);
			this.activeQueryReplications.delete(key);

			query.cancel();
		}
	}

	/**
	 *
	 */
	onCollectionReset(collection) {
		// cancel all replication states for the collection
		this.replicationStates.forEach((replication, endpoint) => {
			if (replication.collection.name === collection.name) {
				this.deregisterReplication(endpoint);
			}
		});

		// cancel all query states for the collection
		this.queryStates.forEach((query, key) => {
			if (query.collection.name === collection.name) {
				this.deregisterQuery(key);
			}
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
		const replicationState = this.replicationStates.get(endpoint);
		const syncCollection = this.getSyncCollection(collection.name);
		if (!replicationState || !(replicationState instanceof CollectionReplicationState)) {
			const collectionReplication = new CollectionReplicationState({
				httpClient: this.httpClient,
				collection,
				syncCollection,
				endpoint,
				errorSubject: this.subjects.error,
			});

			/**
			 * onRemove seems to the right place to reset the query states
			 * onDestroy is too early
			 */
			collection.onRemove.push(() => this.onCollectionReset(collection));

			this.replicationStates.set(endpoint, collectionReplication);
		}

		return this.replicationStates.get(endpoint);
	}

	/**
	 * There is one replication state per query endpoint
	 */
	registerQueryReplication({ queryEndpoint, collectionReplication, collection, greedy }) {
		const replicationState = this.replicationStates.get(queryEndpoint);
		if (!replicationState || !(replicationState instanceof QueryReplicationState)) {
			const queryReplication = new QueryReplicationState({
				httpClient: this.httpClient,
				collectionReplication,
				collection,
				endpoint: queryEndpoint,
				errorSubject: this.subjects.error,
				greedy,
			});

			this.replicationStates.set(queryEndpoint, queryReplication);
		}

		return this.replicationStates.get(queryEndpoint);
	}

	/**
	 *
	 */
	deregisterReplication(endpoint: string) {
		const replicationState = this.replicationStates.get(endpoint);
		if (replicationState) {
			this.replicationStates.delete(endpoint);
			replicationState.cancel();
		}
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
	 * - cancel all queries
	 */
	cancel() {
		super.cancel();

		// Cancel all queries
		this.queryStates.forEach((query) => query.cancel());

		// Cancel all replications
		this.replicationStates.forEach((replication) => replication.cancel());
	}
}
