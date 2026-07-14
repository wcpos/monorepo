import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { engineCollectionNameFor, type LegacyCollectionName } from './collection-map';

import type { AdapterDatabase } from './execute-query';

/**
 * The engine's RxDB database opens ASYNCHRONOUSLY: `engine.active()` returns
 * `null` (and `ready` is pending) until the initial scope switch settles. The
 * query surface must still be constructible synchronously across that window
 * (ADR 0023 increment 1b: "ready = initial database usable; bootstrap/lane
 * failures are degraded, not fatal"). A {@link Query} therefore binds to THIS
 * stable stand-in whenever the live engine collection isn't open yet — it
 * degrades to empty results (via `executeAdapterQuery`) and the Manager nudges
 * re-registration once `engine.ready` settles, rebinding the query to the live
 * collection.
 */
export interface PendingEngineCollection {
	readonly name: string;
	/** A LIVE view of the engine database — resolves the real collections the
	 * instant the engine opens (empty until then). */
	readonly database: AdapterDatabase;
	initSearch(locale?: string): Promise<null>;
	find(params?: MangoLikeParams): MangoQueryStub;
}

type MangoLikeParams = {
	selector?: Record<string, unknown>;
	sort?: unknown[];
	skip?: number;
	limit?: number;
};

export interface MangoQueryStub {
	readonly mangoQuery: MangoLikeParams & { selector: Record<string, unknown>; sort: unknown[] };
	other: Record<string, unknown>;
	limit(value: number): MangoQueryStub;
	skip(value: number): MangoQueryStub;
	[key: string]: unknown;
}

/**
 * A minimal, chainable stand-in for an RxDB `RxQuery`. The engine read path
 * ({@link Query._engineFind$}) only reads `.mangoQuery`; the builder verbs are
 * chainable no-ops so nothing throws if a screen touches the fluent API during
 * the (sub-second) pending window, before the query is rebound to the live
 * collection.
 */
function mangoQueryStub(params: MangoLikeParams = {}): MangoQueryStub {
	const mangoQuery = {
		selector: params.selector ?? {},
		sort: params.sort ?? [],
		...(params.skip !== undefined ? { skip: params.skip } : {}),
		...(params.limit !== undefined ? { limit: params.limit } : {}),
	};
	const base = {
		mangoQuery,
		other: {} as Record<string, unknown>,
		limit: (value: number) => mangoQueryStub({ ...mangoQuery, limit: value }),
		skip: (value: number) => mangoQueryStub({ ...mangoQuery, skip: value }),
	};
	return new Proxy(base, {
		get(target, prop) {
			if (prop in target) {
				return (target as Record<string | symbol, unknown>)[prop];
			}
			return () => mangoQueryStub(mangoQuery);
		},
	}) as unknown as MangoQueryStub;
}

export function createPendingEngineCollection(
	engine: RxdbSyncEngine,
	collectionName: LegacyCollectionName
): PendingEngineCollection {
	const engineName = engineCollectionNameFor(collectionName);
	const database: AdapterDatabase = {
		get collections() {
			return (engine.active()?.database.collections ?? {}) as AdapterDatabase['collections'];
		},
	};
	return {
		name: engineName,
		database,
		initSearch: () => Promise.resolve(null),
		find: (params) => mangoQueryStub(params),
	};
}
