import * as React from 'react';

import { defer, merge, of } from 'rxjs';
import { filter } from 'rxjs/operators';

import { useQueryRuntime } from './provider';

import type { Observable } from 'rxjs';
import type { RxCollection, RxDatabase } from 'rxdb';

/**
 * A reset announcement. The plugin emits the replacement `RxCollection` itself,
 * which carries the `database` it belongs to; test doubles and older emitters
 * may carry only a name, so the owner is optional and absence is tolerated.
 */
export type LocalCollectionReset = { name: string; database?: unknown };

/** `reset$` is contributed by the reset-collection plugin; absent on plain databases. */
export type LocalDatabaseWithReset = RxDatabase & {
	collections: Record<string, unknown>;
	reset$?: Observable<LocalCollectionReset | undefined>;
};

/**
 * Is this reset event this reader's own — the right collection, in the right
 * database? An event with no `database` is accepted: the only emitters that omit
 * it are test doubles, and rejecting them would make the guard untestable
 * without also rejecting every legitimate replacement they stand in for.
 */
function ownReplacement(
	replacement: LocalCollectionReset | undefined,
	collectionName: string,
	localDB: LocalDatabaseWithReset
): boolean {
	if (replacement?.name !== collectionName) return false;
	return replacement.database === undefined || replacement.database === localDB;
}

/**
 * An observable of a local collection that FOLLOWS its replacement.
 *
 * A collection reference is not stable for the lifetime of a screen. Two things
 * can replace it, and each is invisible to the other:
 *
 * - `logs` is removed and re-created IN PLACE by logs-storage-recovery (an OPFS
 *   corruption repair). The replacement is announced only on `reset$`, and
 *   nothing re-renders the consumer when it lands.
 * - A store switch hands the runtime a different `localDB` entirely, which does
 *   re-render but emits nothing on `reset$`.
 *
 * Reading `collections[name]` once handles neither, and the failure is silent:
 * the consumer stays subscribed to a removed collection and simply stops
 * updating, while writes go to its replacement. Hence the read at subscribe time
 * (covers the re-render) merged with `reset$` (covers the silent swap).
 *
 * `reset$` is NOT per-database — `reset-collection.ts` holds ONE module-level
 * `storeReset` Subject and hands every store database the same observable — so
 * the replacement's owner is checked as well as its name. Without that, store
 * A's storage recovery completing after the cashier switched to store B would
 * move B's mounted reader onto A's collection.
 */
export function useFollowedCollection$<T = Record<string, unknown>>(
	database: LocalDatabaseWithReset,
	collectionName: string
): Observable<RxCollection<T> | undefined> {
	const localDB = database;
	const current = localDB.collections[collectionName] as RxCollection<T> | undefined;

	return React.useMemo(() => {
		// `defer` re-reads `collections[name]` at SUBSCRIBE time rather than
		// closing over the render-time snapshot: a subscriber that arrives after
		// an already-delivered reset (`reset$` is a plain Subject and does not
		// replay) would otherwise be handed the collection that reset removed.
		const currentAtSubscribe$ = defer(() =>
			of(localDB.collections[collectionName] as RxCollection<T> | undefined)
		);
		return localDB.reset$
			? // `merge`, not `concat`: both are subscribed immediately, so a reset
				// landing in the gap between the initial emission and the live
				// subscription cannot be dropped.
				merge(
					currentAtSubscribe$,
					localDB.reset$.pipe(
						filter((replacement) => ownReplacement(replacement, collectionName, localDB))
					)
				)
			: currentAtSubscribe$;
		// `current` is a dependency on purpose: a replacement swapped into
		// `collections` alongside a re-render must produce a NEW observable so
		// downstream `shareReplay` consumers re-subscribe and re-read.
	}, [localDB, collectionName, current]) as Observable<RxCollection<T> | undefined>;
}

/**
 * The followed collection as a VALUE, correct in the render that switches it.
 *
 * The observable form above is right for a consumer that pipes it (a query
 * binding subscribes, and one render of lag on an async result is invisible).
 * It is wrong for a consumer that RETURNS the collection, because
 * `useObservableState` cannot deliver a new observable's first value during the
 * render that creates it: its `useState` initializer is mount-only, and
 * `useSubscription` resubscribes in a passive `useEffect` keyed on the
 * observable (observable-hooks 4.2.4). A store switch therefore renders the
 * OUTGOING store's collection once, after paint — and a caller handed that
 * collection writes into the store the cashier just left.
 *
 * So the base is read during render and a reset only OVERRIDES it, with the
 * override discarded during render once it no longer belongs to the database on
 * screen. This is the shape `useReceiptEmailQueueCollection` arrived at for the
 * same reason; the owner check is shared with the observable form rather than
 * restated.
 */
export function useFollowedCollection<T = Record<string, unknown>>(
	database: LocalDatabaseWithReset,
	collectionName: string
): RxCollection<T> | undefined {
	const [swap, setSwap] = React.useState<{
		database: LocalDatabaseWithReset;
		collection: RxCollection<T>;
	} | null>(null);

	React.useEffect(() => {
		// Effect as last resort: `reset$` is an imperative RxDB notification with
		// no render-derivable value.
		const subscription = database.reset$?.subscribe((replacement) => {
			if (!ownReplacement(replacement, collectionName, database)) return;
			setSwap({ database, collection: replacement as unknown as RxCollection<T> });
		});
		return () => subscription?.unsubscribe();
	}, [database, collectionName]);

	if (swap && swap.database === database) return swap.collection;
	return database.collections[collectionName] as RxCollection<T> | undefined;
}

/**
 * {@link useFollowedCollection$} bound to the query runtime's `localDB` — the
 * store database, which `QueryProvider` is handed as `localDB={storeDB}`. Use
 * this from anything already inside the provider; pass the database explicitly
 * when the caller holds it from another context (`useCollection` reads it from
 * the store session).
 */
export function useLocalCollection$<T = Record<string, unknown>>(
	collectionName: string
): Observable<RxCollection<T> | undefined> {
	const runtime = useQueryRuntime();
	return useFollowedCollection$<T>(runtime.localDB as LocalDatabaseWithReset, collectionName);
}
