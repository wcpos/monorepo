import { map } from 'rxjs/operators';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeEngineDatabases } from '../engine-query';

import type { EngineRecord, EngineRecordCollectionName } from './engine-record';
import type { Observable } from 'rxjs';

/**
 * THE typed boundary onto `database.collections` (ADR 0028; review candidate 5).
 *
 * The engine hands its database out as a bare `RxDatabase`, so nothing upstream types the
 * collections map — which is why consumers grew per-file duck types and `as unknown as` /
 * `as never` casts to open a collection. This module is the ONE place that vouches for the
 * stored shape instead: `engineCollection()` performs the single cast, and everything it
 * returns is typed in engine-record vocabulary (`EngineRecord<C>` documents).
 *
 * Selectors stay permissive (`Record<string, unknown>`) on purpose: promoted filter/sort
 * columns are query-plane vocabulary owned by the collection registry, deliberately NOT
 * part of `EngineRecordShape` — a selector may name them, the record face may not.
 */
type EngineMangoSelector = Record<string, unknown>;

type EngineFindQuery = {
	selector?: EngineMangoSelector;
	sort?: Record<string, 'asc' | 'desc'>[];
	skip?: number;
	limit?: number;
};

export type EngineCollection<C extends EngineRecordCollectionName> = {
	find(query?: EngineFindQuery): {
		$: Observable<EngineRecord<C>[]>;
		exec(): Promise<EngineRecord<C>[]>;
	};
	findOne(query: string | { selector: EngineMangoSelector }): {
		$: Observable<EngineRecord<C> | null>;
		exec(): Promise<EngineRecord<C> | null>;
	};
	count(query?: { selector?: EngineMangoSelector }): {
		$: Observable<number>;
		exec(): Promise<number>;
	};
	insert(data: Record<string, unknown>): Promise<EngineRecord<C>>;
	/**
	 * Storage-level read that can see tombstones — the deleted-document read path
	 * (e.g. the cart stock guard resolving stock for a pruned catalog row).
	 */
	storageInstance: {
		findDocumentsById(ids: string[], withDeleted: boolean): Promise<unknown[]>;
	};
};

type UnknownDatabase = { collections?: Record<string, unknown> } | null | undefined;

/**
 * Resolve a typed engine collection off a database value, however loosely the caller holds
 * it (`engine.active()?.database`, a `db$` emission, an `observeEngineDatabases` value).
 * Returns `null` while the engine has not opened the collection (cold start, scope move) —
 * callers degrade, they don't throw.
 */
export function engineCollection<C extends EngineRecordCollectionName>(
	database: UnknownDatabase,
	name: C
): EngineCollection<C> | null {
	const collection = database?.collections?.[name];
	return collection ? (collection as EngineCollection<C>) : null;
}

/**
 * The same resolution as a stream: re-resolves on every `db$` emission, so scope moves and
 * resets rebind to the live collection. Emits `null` while no database (or no collection)
 * is open.
 */
export function observeEngineCollection<C extends EngineRecordCollectionName>(
	engine: RxdbSyncEngine,
	name: C
): Observable<EngineCollection<C> | null> {
	return observeEngineDatabases(engine).pipe(map((database) => engineCollection(database, name)));
}
