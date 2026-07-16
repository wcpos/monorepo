import { combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import type { RxdbSyncEngine, Unsubscribe } from '@wcpos/sync-engine';

import { observeEngineDatabases } from './engine-query';

import type { Observable } from 'rxjs';

const SYNC_COLLECTION_NAMES = [
	'orders',
	'products',
	'variations',
	'customers',
	'taxRates',
	'categories',
	'brands',
	'tags',
	'coupons',
] as const;

type SyncCollectionName = (typeof SYNC_COLLECTION_NAMES)[number];
export type EngineCollectionCounts = Record<string, number>;
export type EngineMutationCounts = { pending: number; conflicts: number };

type CountCollection = { count(): { $: Observable<number> } };
type MutationCollection = {
	find(query: { selector: { status: { $in: string[] } } }): {
		$: Observable<readonly unknown[]>;
	};
};

const EMPTY_COLLECTION_COUNTS: EngineCollectionCounts = Object.fromEntries(
	SYNC_COLLECTION_NAMES.map((name) => [name, 0])
) as EngineCollectionCounts;

export function observeEngineCollectionCounts(
	engine: RxdbSyncEngine,
	cb: (counts: EngineCollectionCounts) => void
): Unsubscribe {
	const subscription = observeEngineDatabases(engine)
		.pipe(
			switchMap((database) => {
				if (!database) return of(EMPTY_COLLECTION_COUNTS);
				const collections = database.collections as unknown as Record<
					SyncCollectionName,
					CountCollection
				>;
				return combineLatest(SYNC_COLLECTION_NAMES.map((name) => collections[name].count().$)).pipe(
					map(
						(values) =>
							Object.fromEntries(
								SYNC_COLLECTION_NAMES.map((name, index) => [name, values[index] ?? 0])
							) as EngineCollectionCounts
					)
				);
			})
		)
		.subscribe(cb);
	return () => subscription.unsubscribe();
}

export function observeEngineMutationCounts(
	engine: RxdbSyncEngine,
	cb: (counts: EngineMutationCounts) => void
): Unsubscribe {
	const subscription = observeEngineDatabases(engine)
		.pipe(
			switchMap((database) => {
				if (!database) return of({ pending: 0, conflicts: 0 });
				const mutations = database.collections.recordMutations as unknown as MutationCollection;
				const pending$ = mutations.find({
					selector: { status: { $in: ['pending', 'claimed', 'conflicted', 'needs-revision'] } },
				}).$;
				const conflicts$ = mutations.find({
					selector: { status: { $in: ['conflicted', 'needs-revision', 'rejected'] } },
				}).$;
				return combineLatest([pending$, conflicts$]).pipe(
					map(([pending, conflicts]) => ({
						pending: pending.length,
						conflicts: conflicts.length,
					}))
				);
			})
		)
		.subscribe(cb);
	return () => subscription.unsubscribe();
}
