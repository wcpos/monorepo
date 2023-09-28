import { ObservableResource } from 'observable-hooks';
import { Subject, Observable } from 'rxjs';
import { mergeMap, takeUntil, filter } from 'rxjs/operators';

import type { StoreDatabase } from '@wcpos/database';

import { Query, QueryState } from '../../services/query';
import { ReplicationState } from '../../services/replication';

/**
 * TODO - in the future it would be nice to have a smarter management for replication
 * that can orchestrate audits, queries and mutations and make sure they are all in sync
 * For now, we just create a new replication state for each query, and do some basic
 * optimations within the replication state itself.
 */
export class StoreStateManager {
	private queries: Map<string, Query<any>> = new Map();
	private replicationStates: Map<string, ReplicationState<any, any>> = new Map();

	private replicationStateErrorsSubject = new Subject<Observable<any>>();
	public replicationStateErrors$ = this.replicationStateErrorsSubject.pipe(
		mergeMap((error$) => error$)
	);

	constructor(public storeDB: StoreDatabase) {}

	serializeQueryKey(queryKey: (string | number | object)[]): string {
		try {
			return JSON.stringify(queryKey);
		} catch (error) {
			throw new Error(`Failed to serialize query key: ${error}`);
		}
	}

	hasQuery(queryKey: (string | number | object)[]): boolean {
		const key = this.serializeQueryKey(queryKey);
		return this.queries.has(key);
	}

	registerQuery<T>(
		queryKey: (string | number | object)[],
		collection,
		initialQuery: QueryState,
		hooks?: any,
		locale?: string
	): Query<T> {
		const key = this.serializeQueryKey(queryKey);
		if (!this.queries.has(key)) {
			const query = new Query(collection, initialQuery, hooks, locale);

			/**
			 * Create ObservableResource instances
			 * - this doesn't seem like a Query concern so I'm putting it here
			 */
			query.resource = new ObservableResource(query.$);
			query.paginatedResource = new ObservableResource(query.paginated$);

			this.queries.set(key, query);
		}
		return this.queries.get(key) as Query<T>;
	}

	getQuery<T>(queryKey: (string | number | object)[]): Query<T> | undefined {
		const key = this.serializeQueryKey(queryKey);
		const query = this.queries.get(key);

		if (!query) {
			throw new Error(`Query with key: ${key} not found.`);
		}

		return query;
	}

	deregisterQuery(queryKey: (string | number | object)[]): void {
		const key = this.serializeQueryKey(queryKey);
		// cancel the query
		const query = this.queries.get(key);
		if (query) {
			query.cancel();
			this.queries.delete(key);
		}
	}

	/**
	 * Replications are unique to an endpoint, most of the time endpoint = collection
	 * except for variations which are a pain in the ass
	 */
	registerReplicationState<T>(
		endpoint: string,
		collection,
		http: any,
		hooks: any
	): ReplicationState<T> {
		if (!this.replicationStates.has(endpoint)) {
			const replication = new ReplicationState({ collection, hooks, http });
			this.replicationStates.set(endpoint, replication);

			// Subscribe to this replicationState's error$ and remove it upon deregistration
			const canceled$ = replication.canceled$.pipe(filter((isCanceled) => isCanceled === true));
			this.replicationStateErrorsSubject.next(replication.error$.pipe(takeUntil(canceled$)));
		}
		return this.replicationStates.get(endpoint) as ReplicationState<T>;
	}

	deregisterReplicationState(endpoint: string): void {
		const replicationState = this.replicationStates.get(endpoint);
		if (replicationState) {
			replicationState.cancel();
			this.replicationStates.delete(endpoint);
		}
	}

	/**
	 * @TODO - there is a problem when creating a new customer in the cart
	 * The customer replicationState has not be registered yet, so it throws an error
	 * - surely replicationState should be decoupled from useQuery
	 */
	getReplicationState(endpoint: string) {
		const replicationState = this.replicationStates.get(endpoint);

		if (!replicationState) {
			throw new Error(`Replication State with endpoint: ${endpoint} not found.`);
		}

		return replicationState;
	}
}
