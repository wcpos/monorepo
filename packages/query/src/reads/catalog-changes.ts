import { EMPTY, merge, switchMap } from 'rxjs';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeEngineDatabases } from '../engine-query';

/** Resident stock changes from local writes and pulls, without scanning the catalog. */
export function observeCatalogChanges(engine: RxdbSyncEngine) {
	return observeEngineDatabases(engine).pipe(
		switchMap((db) =>
			merge(db?.collections.products?.$ ?? EMPTY, db?.collections.variations?.$ ?? EMPTY)
		)
	);
}
