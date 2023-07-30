import { ObservableResource } from 'observable-hooks';

import type { StoreDatabase } from '@wcpos/database';
import {
	replicateRxCollection,
	ReplicationState,
	ReplicationOptions,
} from '@wcpos/database/src/plugins/wc-rest-api-replication';

import { Query, QueryState } from './query';

/**
 *
 */
export class StoreStateManager {
	private currentStoreDB: StoreDatabase | null = null;
	private queries: Map<string, Query<any>> = new Map();

	constructor(public storeDB: StoreDatabase) {
		this.currentStoreDB = storeDB;
	}

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
		initialQuery: QueryState
	): Query<T> {
		const key = this.serializeQueryKey(queryKey);
		if (!this.queries.has(key)) {
			const query = new Query(collection, initialQuery);
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
		this.queries.delete(key);
	}
}
