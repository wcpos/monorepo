import { combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import type { CensusTotals, RxdbSyncEngine, Unsubscribe } from '@wcpos/sync-engine';

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
export type EngineMutationCounts = {
	pending: number;
	/** Pending mutations on the orders collection only — the "sales waiting to send" number. */
	pendingOrders: number;
	conflicts: number;
};

type CountCollection = { count(): { $: Observable<number> } };
type MutationCollection = {
	find(query: { selector: { status: { $in: string[] }; collectionName?: { $eq: string } } }): {
		$: Observable<readonly unknown[]>;
	};
};

const EMPTY_COLLECTION_COUNTS: EngineCollectionCounts = Object.fromEntries(
	SYNC_COLLECTION_NAMES.map((name) => [name, 0])
) as EngineCollectionCounts;

export function observeEngineCensus(
	engine: RxdbSyncEngine,
	cb: (totals: CensusTotals) => void
): Unsubscribe {
	return engine.censusChanges(cb);
}

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
				if (!database) return of({ pending: 0, pendingOrders: 0, conflicts: 0 });
				const mutations = database.collections.recordMutations as unknown as MutationCollection;
				const pendingSelector = {
					status: { $in: ['pending', 'claimed', 'conflicted', 'needs-revision'] },
				};
				const pending$ = mutations.find({ selector: pendingSelector }).$;
				// The queue carries every collection's writes; "sales waiting" must
				// count only orders or a queued product edit reads as an unsent sale.
				const pendingOrders$ = mutations.find({
					selector: { ...pendingSelector, collectionName: { $eq: 'orders' } },
				}).$;
				const conflicts$ = mutations.find({
					selector: { status: { $in: ['conflicted', 'needs-revision', 'rejected'] } },
				}).$;
				return combineLatest([pending$, pendingOrders$, conflicts$]).pipe(
					map(([pending, pendingOrders, conflicts]) => ({
						pending: pending.length,
						pendingOrders: pendingOrders.length,
						conflicts: conflicts.length,
					}))
				);
			})
		)
		.subscribe(cb);
	return () => subscription.unsubscribe();
}
