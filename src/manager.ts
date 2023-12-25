import { Observable, Subject, Subscription } from 'rxjs';

import { CollectionReplicationState } from './collection-replication-state';
import { QueryReplicationState } from './query-replication-state';
import { Query } from './query-state';
import { buildUrlWithParams } from './utils';

import type { QueryParams, QueryHooks } from './query-state';
import type { RxDatabase, RxCollection } from 'rxdb';

/**
 *
 */
export interface ResisterQueryConfig {
	queryKeys: (string | number | object)[];
	collectionName: string;
	initialParams?: QueryParams;
	hooks?: QueryHooks;
	locale?: string;
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
	 *
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
		private httpClient
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

	registerQuery({
		queryKeys,
		collectionName,
		initialParams,
		hooks = {},
		locale,
		...args
	}: ResisterQueryConfig) {
		const key = this.stringify(queryKeys);
		const endpoint = args.endpoint || collectionName;

		if (key && !this.queries.has(key)) {
			const collection = this.getCollection(collectionName);
			if (collection) {
				const query = new Query<typeof collection>({ id: key, collection, initialParams, hooks });
				const collectionReplication = this.registerCollectionReplication({ collection, endpoint });
				this.addQueryKeyToReplicationsMap(key, endpoint);
				collectionReplication.start();

				/**
				 * Subscribe to query params and register a new replication state for the query
				 * - also cancel the previous query replication
				 */
				this.subs.push(
					query.params$.subscribe((params) => {
						const apiQueryParams = this.getApiQueryParams(params);
						const queryEndpoint = buildUrlWithParams(endpoint, apiQueryParams);
						const queryReplication = this.registerQueryReplication({
							collectionReplication,
							collection,
							endpoint: queryEndpoint,
						});
						this.addQueryKeyToReplicationsMap(key, queryEndpoint);
						queryReplication.start();
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
		if (!this.replicationStates.has(endpoint)) {
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

			this.replicationStates.set(endpoint, queryReplication);
		}

		return this.replicationStates.get(endpoint);
	}

	/**
	 * Get the query params that are used for the API
	 * - NOTE: the api query params have a different format than the query params
	 * - allow hooks to modify the query params
	 */
	getApiQueryParams(params: QueryParams) {
		params = params || {};

		Object.assign(params, {
			uuid: undefined, // remove all uuid params?
			per_page: 10,
		});

		if (this.hooks?.filterApiQueryParams) {
			params = this.hooks.filterApiQueryParams(params);
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
