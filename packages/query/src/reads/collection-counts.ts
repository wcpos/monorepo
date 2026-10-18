import { combineLatest, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import {
	type RxdbSyncEngine,
	SYNC_COLLECTION_NAMES,
	type SyncCollectionName,
} from '@wcpos/sync-engine';
export type EngineCollectionCounts = Record<string, number>;
type CountCollection = { count(): { $: Observable<number> } };
type EngineDatabase = NonNullable<ReturnType<RxdbSyncEngine['active']>>['database'];
export const EMPTY_COLLECTION_COUNTS = Object.fromEntries(
	SYNC_COLLECTION_NAMES.map((name) => [name, 0])
) as EngineCollectionCounts;

export function observeCollectionCounts(
	engine: RxdbSyncEngine
): Observable<EngineCollectionCounts> {
	return new Observable<EngineDatabase | null>((subscriber) =>
		engine.db$((database) => subscriber.next(database))
	).pipe(
		switchMap((database) => {
			if (!database) return of(EMPTY_COLLECTION_COUNTS);
			const collections = database.collections as unknown as Record<
				SyncCollectionName,
				CountCollection
			>;
			return combineLatest(SYNC_COLLECTION_NAMES.map((name) => collections[name].count().$)).pipe(
				map((values) =>
					Object.fromEntries(SYNC_COLLECTION_NAMES.map((name, index) => [name, values[index] ?? 0]))
				)
			);
		})
	);
}
