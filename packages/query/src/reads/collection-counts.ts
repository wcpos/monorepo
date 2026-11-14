import { combineLatest, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import {
	type RxdbSyncEngine,
	SYNC_COLLECTION_NAMES,
	type SyncCollectionName,
} from '@wcpos/sync-engine';

import { engineCollection } from '../records/engine-collection';

export type EngineCollectionCounts = Record<string, number>;
type CountCollection = { count(): { $: Observable<number> } };
type EngineDatabase = NonNullable<ReturnType<RxdbSyncEngine['active']>>['database'];
/**
 * Every sync collection at zero. Computed on first use, not at module load: hosts that
 * partially mock `@wcpos/sync-engine` (apps/main `create-app-engine.test.ts`) import this
 * package without `SYNC_COLLECTION_NAMES`, and an eager read would throw on import.
 */
let emptyCounts: EngineCollectionCounts | undefined;
export function emptyCollectionCounts(): EngineCollectionCounts {
	emptyCounts ??= Object.fromEntries(SYNC_COLLECTION_NAMES.map((name) => [name, 0]));
	return emptyCounts;
}

export function observeCollectionCounts(
	engine: RxdbSyncEngine
): Observable<EngineCollectionCounts> {
	return new Observable<EngineDatabase | null>((subscriber) =>
		engine.db$((database) => subscriber.next(database))
	).pipe(
		switchMap((database) => {
			if (!database) return of(emptyCollectionCounts());
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

/** Serialized lengths for the health screen's approximate collection size. */
export async function readCollectionSampleSizes(
	engine: RxdbSyncEngine,
	name: SyncCollectionName,
	limit: number
): Promise<number[] | null> {
	let scope: ReturnType<RxdbSyncEngine['active']>;
	try {
		scope = engine.active();
	} catch {
		return null; // engine disposed mid-debounce — nothing to sample
	}
	const collection = engineCollection(scope?.database, name);
	if (!collection) return null;
	const docs = await collection.find({ limit }).exec();
	return docs.map((doc) => JSON.stringify(doc.toJSON()).length);
}
