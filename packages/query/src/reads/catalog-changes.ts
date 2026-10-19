import { EMPTY, merge, switchMap, tap } from 'rxjs';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeEngineDatabases } from '../engine-query';

const generations = new WeakMap<RxdbSyncEngine, number>();

/** Synchronous fence; callers keep observeCatalogChanges subscribed during their write. */
export const readCatalogGeneration = (engine: RxdbSyncEngine) => generations.get(engine) ?? 0;

/** Resident stock changes from local writes and pulls, without scanning the catalog. */
export function observeCatalogChanges(engine: RxdbSyncEngine) {
	return observeEngineDatabases(engine).pipe(
		switchMap((db) =>
			merge(db?.collections.products?.$ ?? EMPTY, db?.collections.variations?.$ ?? EMPTY)
		),
		tap(() => generations.set(engine, readCatalogGeneration(engine) + 1))
	);
}
