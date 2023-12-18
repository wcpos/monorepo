import { Observable, Subject, Subscription } from 'rxjs';

import { CollectionReplicationState } from './collection-replication-state';
import { QueryReplicationState } from './query-replication-state';
import { Query } from './query-state';

import type { QueryParams, QueryHooks } from './query-state';
import type { RxDatabase, RxCollection } from 'rxdb';

export class Manager<TDatabase extends RxDatabase> {
	private isCanceled = false;

	/**
	 * Registry of all query and replication states
	 */
	private queries: Map<string, Query<RxCollection>> = new Map();
	private collectionReplicationStates: Map<string, CollectionReplicationState<RxCollection>> =
		new Map();
	private queryReplicationStates: Map<string, QueryReplicationState> = new Map();

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
		queryKey,
		collectionName,
		initialParams,
		hooks,
		locale,
	}: {
		queryKey: (string | number | object)[];
		collectionName: string;
		initialParams?: QueryParams;
		hooks?: QueryHooks;
		locale?: string;
	}) {
		const key = this.serializeQueryKey(queryKey);
		if (key && !this.queries.has(key)) {
			const collection = this.getCollection(collectionName);
			if (collection) {
				const query = new Query<typeof collection>({ collection, initialParams, hooks });
				const collectionReplication = this.registerCollectionReplication(collectionName);

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
		return this.getQuery(queryKey);
	}

	getCollection(collectionName: string) {
		if (!this.localDB[collectionName]) {
			this.subjects.error.next(new Error(`Collection with name: ${collectionName} not found.`));
		}
		return this.localDB[collectionName];
	}

	getQuery(queryKey: (string | number | object)[]) {
		const key = this.serializeQueryKey(queryKey);
		const query = this.queries.get(key);

		if (!query) {
			this.subjects.error.next(new Error(`Query with key: ${key} not found.`));
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
	 * There is one collection replication state per collection
	 */
	registerCollectionReplication(collectionName: string) {
		if (!this.collectionReplicationStates.has(collectionName)) {
			const collection = this.getCollection(collectionName);

			const collectionReplication = new CollectionReplicationState({
				httpClient: this.httpClient,
				collection,
			});

			/**
			 * Subscribe to query errors and pipe them to the error subject
			 */
			this.subs.push(
				collectionReplication.error$.subscribe((error) => {
					this.subjects.error.next(error);
				})
			);

			this.collectionReplicationStates.set(collectionName, collectionReplication);
		}

		return this.collectionReplicationStates.get(collectionName);
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
