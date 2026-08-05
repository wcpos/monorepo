import { distinctUntilChanged, map, Observable, shareReplay } from 'rxjs';

import type { EngineStatus, RxdbSyncEngine, SyncCollectionName } from '@wcpos/sync-engine';

const snapshots = new WeakMap<RxdbSyncEngine, Observable<EngineStatus['collections']>>();
function observeEngineCollections(engine: RxdbSyncEngine): Observable<EngineStatus['collections']> {
	const existing = snapshots.get(engine);
	if (existing) return existing;
	const created = new Observable<EngineStatus['collections']>((subscriber) =>
		engine.statusChanges((status) => subscriber.next(status.collections))
	).pipe(shareReplay({ bufferSize: 1, refCount: true }));
	snapshots.set(engine, created);
	return created;
}

export function observeCollectionActive(
	engine: RxdbSyncEngine,
	collection: SyncCollectionName
): Observable<boolean> {
	return observeEngineCollections(engine).pipe(
		map((collections) => collections[collection].active),
		distinctUntilChanged()
	);
}
