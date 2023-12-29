import forEach from 'lodash/forEach';
import { Observable, Subject, Subscription } from 'rxjs';

import { CollectionReplicationState } from './collection-replication-state';
import allHooks from './hooks';
import { QueryReplicationState } from './query-replication-state';
import { Query } from './query-state';
import { Search } from './search-state';
import { buildUrlWithParams } from './utils';

import type { QueryParams } from './query-state';
import type { RxDatabase, RxCollection } from 'rxdb';

/**
 *
 */
export interface RegisterQueryConfig {
	queryKeys: (string | number | object)[];
	collectionName: string;
	initialParams?: QueryParams;
	endpoint?: string;
}

/**
 *
 */
export class Manager<TDatabase extends RxDatabase> {
	private isCanceled = false;

	/**
	 * Registry of all RxDB queries, indexed by queryKeys
	 */
	public queries: Map<string, Query<RxCollection>> = new Map();

	/**
	 * Registry of all replication states, indexed by endpoint & query params
	 * - for most collections collection.name = endpoint
	 * - special case for product variations, where:
	 * -- endpoint = 'products/<parent_id>/variations' and
	 * -- endpoint = 'products/variations' (for all variation queries, ie: barcode)
	 * - a query replication state will have the endpoint and query params, eg:
	 * -- 'products?stock_status=instock'
	 *
	 * NOTE: replication states can be shared between queryKeys
	 */
	public replicationStates: Map<
		string,
		CollectionReplicationState<RxCollection> | QueryReplicationState<RxCollection>
	> = new Map();

	/**
	 * Each queryKey should have one collection replication and at least one query replication
	 */
	public queryKeyToReplicationsMap: Map<string, string[]> = new Map();

	/**
	 *
	 */
	public readonly subs: Subscription[] = [];
	public readonly subjects = {
		error: new Subject<Error>(),
	};

	/**
	 *
	 */
	readonly error$: Observable<Error> = this.subjects.error.asObservable();

	constructor(
		private localDB: TDatabase,
		private httpClient,
		private locale: string
	) {
		/**
		 * Subscribe to localDB to detect if collection is reset
		 */
		this.subs.push(
			this.localDB.reset$.subscribe((col) => {
				// find all queries that use this collection
				this.queries.forEach((query, key) => {
					if (query.collection.name === col.name) {
						// cancel all replications
						const endpoints = this.queryKeyToReplicationsMap.get(key);
						endpoints.forEach((endpoint) => {
							const replication = this.replicationStates.get(endpoint);
							replication.cancel();
							this.replicationStates.delete(endpoint);
						});
						this.queryKeyToReplicationsMap.delete(key);
						// cancel the query
						this.queries.delete(key);
						query.cancel();
					}
				});
			})
		);
	}

	stringify(params: any): string {
		try {
			return JSON.stringify(params);
		} catch (error) {
			this.subjects.error.next(new Error(`Failed to serialize query key: ${error}`));
		}
	}

	hasQuery(queryKeys: (string | number | object)[]): boolean {
		const key = this.stringify(queryKeys);
		return this.queries.has(key);
	}

	registerQuery({ queryKeys, collectionName, initialParams, ...args }: RegisterQueryConfig) {
		const key = this.stringify(queryKeys);
		const endpoint = args.endpoint || collectionName;
		const hooks = allHooks[collectionName] || {};

		if (key && !this.queries.has(key)) {
			const collection = this.getCollection(collectionName);
			if (collection) {
				const searchService = new Search({ collection, locale: this.locale });
				const query = new Query<typeof collection>({
					id: key,
					collection,
					initialParams,
					hooks,
					searchService,
				});
				const collectionReplication = this.registerCollectionReplication({ collection, endpoint });
				this.addQueryKeyToReplicationsMap(key, endpoint);
				collectionReplication.start();

				/**
				 * Add some subscriptions for the Query Class
				 * - these will be completed when the query instance is cancelled
				 */
				query.subs.push(
					/**
					 * Subscribe to query params and register a new replication state for the query
					 * - also cancel the previous query replication
					 */
					query.params$.subscribe((params) => {
						let apiQueryParams = this.getApiQueryParams(params);
						if (hooks?.filterApiQueryParams) {
							apiQueryParams = hooks.filterApiQueryParams(apiQueryParams, params);
						}
						const queryEndpoint = buildUrlWithParams(endpoint, apiQueryParams);

						if (!this.replicationStates.has(queryEndpoint)) {
							const queryReplication = this.registerQueryReplication({
								collectionReplication,
								collection,
								endpoint: queryEndpoint,
							});

							/**
							 * Subscribe to the query trigger and trigger the query replication
							 */
							query.subs.push(
								query.triggerServerQuery$.subscribe((page) => {
									queryReplication.nextPage();
								})
							);

							queryReplication.start();
						}

						this.addQueryKeyToReplicationsMap(key, queryEndpoint);
					})
				);

				/**
				 * Subscribe to query errors and pipe them to the error subject
				 */
				this.subs.push(
					query.error$.subscribe((error) => {
						this.subjects.error.next(error);
					})
				);

				this.queries.set(key, query);
			}
		}

		return this.getQuery(queryKeys);
	}

	getCollection(collectionName: string) {
		if (!this.localDB[collectionName]) {
			this.subjects.error.next(new Error(`Collection with name: ${collectionName} not found.`));
		}
		return this.localDB[collectionName];
	}

	getQuery(queryKeys: (string | number | object)[]) {
		const key = this.stringify(queryKeys);
		const query = this.queries.get(key);

		if (!query) {
			this.subjects.error.next(new Error(`Query with key: ${key} not found.`));
		}

		return query;
	}

	deregisterQuery(queryKeys: (string | number | object)[]): void {
		const key = this.stringify(queryKeys);
		// cancel the query
		const query = this.queries.get(key);
		if (query) {
			query.cancel();
			this.queries.delete(key);
		}
	}

	/**
	 * TODO: I need track how many queries are using a replication state, ie:
	 * increment / decrement a counter when a query is added / removed
	 */
	addQueryKeyToReplicationsMap(key: string, endpoint: string) {
		if (!this.queryKeyToReplicationsMap.has(key)) {
			this.queryKeyToReplicationsMap.set(key, []);
		}
		const replications = this.queryKeyToReplicationsMap.get(key);
		if (!replications.includes(endpoint)) {
			replications.push(endpoint);
		}
	}

	getReplicationStatesByQueryID(key: string) {
		const endpoints = this.queryKeyToReplicationsMap.get(key);
		return endpoints.map((endpoint) => this.replicationStates.get(endpoint));
	}

	getReplicationStatesByQueryKeys(queryKeys: (string | number | object)[]) {
		const key = this.stringify(queryKeys);
		return this.getReplicationStatesByQueryID(key);
	}

	/**
	 * There is one replication state per collection
	 */
	registerCollectionReplication({ collection, endpoint }) {
		if (!this.replicationStates.has(endpoint)) {
			const collectionReplication = new CollectionReplicationState({
				httpClient: this.httpClient,
				collection,
				endpoint,
			});

			/**
			 * Subscribe to query errors and pipe them to the error subject
			 */
			this.subs.push(
				collectionReplication.error$.subscribe((error) => {
					this.subjects.error.next(error);
				})
			);

			this.replicationStates.set(endpoint, collectionReplication);
		}

		return this.replicationStates.get(endpoint);
	}

	/**
	 * There is one replication state per unique query
	 */
	registerQueryReplication({ endpoint, collectionReplication, collection }) {
		const queryReplication = new QueryReplicationState({
			httpClient: this.httpClient,
			collectionReplication,
			collection,
			endpoint,
		});

		/**
		 * Subscribe to query errors and pipe them to the error subject
		 */
		this.subs.push(
			queryReplication.error$.subscribe((error) => {
				this.subjects.error.next(error);
			})
		);

		this.replicationStates.set(endpoint, collectionReplication);
		return queryReplication;
	}

	/**
	 * Get the query params that are used for the API
	 * - NOTE: the api query params have a different format than the query params
	 * - allow hooks to modify the query params
	 */
	getApiQueryParams(queryParams: QueryParams = {}) {
		const params = {
			orderby: queryParams?.sortBy,
			order: queryParams?.sortDirection,
			per_page: 10,
		};

		if (queryParams?.search && typeof queryParams?.search === 'string') {
			params.search = queryParams?.search;
		}

		if (queryParams?.selector) {
			forEach(queryParams.selector, (value, key) => {
				params[key] = value;
			});
		}

		return params;
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
		this.isCanceled = true;
		this.subs.forEach((sub) => sub.unsubscribe());

		// Complete subjects
		this.subjects.error.complete();

		// Cancel all queries
		this.queries.forEach((query) => query.cancel());
	}
}
