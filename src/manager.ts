import { Observable, Subject, Subscription } from 'rxjs';

import { CollectionReplicationState } from './collection-replication-state';
import { QueryReplicationState } from './query-replication-state';
import { Query } from './query-state';

import type { QueryParams, QueryHooks } from './query-state';
import type { RxDatabase, RxCollection } from 'rxdb';

export class Manager<TDatabase extends RxDatabase> {
	private isCanceled = false;

	/**
	 * Registry of all RxDB queries, indexed by query key
	 */
	public queries: Map<string, Query<RxCollection>> = new Map();

	/**
	 * Registry of all replication states, indexed by endpoint
	 * - for most collections collection.name = endpoint
	 * - special case for product variations, where:
	 * -- endpoint = 'products/<parent_id>/variations' and
	 * -- endpoint = 'products/variations' (for all variation queries, ie: barcode)
	 */
	private collectionReplicationStates: Map<string, CollectionReplicationState<RxCollection>> =
		new Map();
	private queryReplicationStates: Map<string, Map<string, QueryReplicationState<RxCollection>>> =
		new Map();

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
	) {}

	serializeQueryKey(queryKey: (string | number | object)[]): string {
		try {
			return JSON.stringify(queryKey);
		} catch (error) {
			this.subjects.error.next(new Error(`Failed to serialize query key: ${error}`));
		}
	}

	hasQuery(queryKey: (string | number | object)[]): boolean {
		const key = this.serializeQueryKey(queryKey);
		return this.queries.has(key);
	}

	registerQuery({
		queryKeys,
		collectionName,
		initialParams,
		hooks = {},
		locale,
	}: {
		queryKeys: (string | number | object)[];
		collectionName: string;
		initialParams?: QueryParams;
		hooks?: QueryHooks;
		locale?: string;
	}) {
		const key = this.serializeQueryKey(queryKeys);
		if (key && !this.queries.has(key)) {
			const collection = this.getCollection(collectionName);
			if (collection) {
				const query = new Query<typeof collection>({ collection, initialParams, hooks });
				const endpoint = this.getEndpoint(collection, hooks);
				const collectionReplication = this.registerCollectionReplication({ collection, endpoint });

				/**
				 * Subscribe to query params and register a new replication state for the query
				 * - also cancel the previous query replication
				 */
				this.subs.push(
					query.params$.subscribe((params) => {
						const apiQueryParams = this.getApiQueryParams(params);
						this.registerQueryReplication(
							apiQueryParams,
							collectionReplication,
							collection,
							endpoint
						);
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
		const key = this.serializeQueryKey(queryKeys);
		const query = this.queries.get(key);

		if (!query) {
			this.subjects.error.next(new Error(`Query with key: ${key} not found.`));
		}

		return query;
	}

	deregisterQuery(queryKeys: (string | number | object)[]): void {
		const key = this.serializeQueryKey(queryKeys);
		// cancel the query
		const query = this.queries.get(key);
		if (query) {
			query.cancel();
			this.queries.delete(key);
		}
	}

	/**
	 * Allow the user to override the endpoint, eg: variations collection will have
	 * /products/<parent_id>/variations endpoint
	 */
	getEndpoint(collection, hooks): string {
		if (hooks.preEndpoint) {
			return hooks.preEndpoint(collection);
		}
		return collection.name;
	}

	/**
	 * There is one replication state per collection
	 */
	registerCollectionReplication({ collection, endpoint }) {
		if (!this.collectionReplicationStates.has(endpoint)) {
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

			this.collectionReplicationStates.set(endpoint, collectionReplication);
		}

		return this.collectionReplicationStates.get(endpoint);
	}

	/**
	 * There is one replication state per unique query
	 */
	registerQueryReplication(apiQueryParams, collectionReplication, collection, endpoint) {
		if (!this.queryReplicationStates.has(endpoint)) {
			this.queryReplicationStates.set(endpoint, new Map());
		}
		const queryStates = this.queryReplicationStates.get(endpoint);
		const apiQueryKey = this.serializeQueryKey(apiQueryParams);

		// pause all other queries
		queryStates.forEach((state) => {
			state.pause();
		});

		// if there is no query state for this query, create one
		let queryState = queryStates.get(apiQueryKey);
		if (!queryState) {
			queryState = new QueryReplicationState({
				httpClient: this.httpClient,
				apiQueryParams,
				collectionReplication,
				collection,
				endpoint,
			});

			/**
			 * Subscribe to query errors and pipe them to the error subject
			 */
			this.subs.push(
				queryState.error$.subscribe((error) => {
					this.subjects.error.next(error);
				})
			);

			queryStates.set(apiQueryKey, queryState);
		}

		// start the query
		queryState.start();
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
