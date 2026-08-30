import { ObservableResource } from 'observable-hooks';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import type { Observable } from 'rxjs';

/**
 * Suspense resources for engine records, held OUTSIDE the render lifecycle.
 *
 * A resource built during render must NOT live in `useMemo`, `useState` or `useRef`,
 * because all three live on the fiber: when a component suspends before its subtree has
 * ever committed, React unwinds to the boundary and throws the work-in-progress fibers
 * away, hook state included. The retry then re-runs the factory, builds a *new*
 * `ObservableResource`, and — since `ObservableResource` subscribes in its constructor and
 * `read()` throws a fresh promise until the first value lands — that new resource suspends
 * for exactly the reason its predecessor did. Each retry manufactures the condition that
 * triggers the next one, so the wait never ends on its own: it is a loop, not a load.
 *
 * That is the Orders blank-body failure (#1707), where `FilterBar` built the stores resource
 * in a `useMemo` and the suspension escaped to expo-router's per-route boundary, whose
 * production fallback is `null`. The `useEngineRecord*` hooks carried the same shape: an
 * engine record's first emission is always asynchronous (`findOne(...).$` on a live RxDB
 * collection, or the `db$` emission that opens the collection at all), so every consumer
 * that suspends on a cold read spins until something outside it forces a commit.
 *
 * Keying the resource on the engine plus the record identity is what makes it outlive the
 * retry: the second attempt reads back the resource the first one already subscribed, so
 * the first emission ends the wait for good. `WeakMap` on the engine so a torn-down scope's
 * resources go with it; the inner `Map` is the bounded part (see below).
 *
 * Cache growth. Two things can put an entry in and only one of them can take it out on its
 * own: a consumer that commits retains its entry and releases it on unmount/rebind, which
 * destroys the resource and drops it immediately (the RxDB subscription must not outlive its
 * last reader). A render that never commits — the retry above, or any discarded render —
 * leaves an entry nobody will ever release, which is precisely what has to survive for the
 * retry to find it. Those are bounded by `MAX_ENTRIES_PER_ENGINE`: the least recently asked
 * for UNRETAINED entry is destroyed and evicted once the map is over the limit. A screen
 * asks for a handful of distinct records, so the limit is never reached in practice; it
 * exists so a long session cycling through records cannot grow the map forever.
 */

/**
 * The most engine-record resources kept per engine. High enough that no screen's live set
 * comes close (a filter bar asks for two or three; an edit screen for one), low enough that
 * a session paging through thousands of records cannot accumulate their subscriptions.
 * Evicting an unretained entry costs at most one rebuilt resource.
 */
const MAX_ENTRIES_PER_ENGINE = 32;

/**
 * A cached entry seen without its value type — what the cache and the retain/release
 * bookkeeping need. `ObservableResource<T>` is invariant in `T` (its `valueRef$$` exposes an
 * observers array), so the generic entry cannot be widened to `unknown`; it narrows this.
 */
export interface EngineResourceHandle {
	readonly key: string;
	readonly resource: { readonly isDestroyed: boolean; destroy(): void };
	/** Mounted consumers holding this entry. Zero means nothing has committed on it (yet). */
	refCount: number;
	/** The map this entry lives in, so a release can evict itself without the engine. */
	readonly cache: Map<string, EngineResourceHandle>;
}

export interface EngineResourceEntry<T> extends EngineResourceHandle {
	readonly resource: ObservableResource<T>;
}

const cacheByEngine = new WeakMap<RxdbSyncEngine, Map<string, EngineResourceHandle>>();

function evictUnretained(
	cache: Map<string, EngineResourceHandle>,
	keep: EngineResourceHandle
): void {
	if (cache.size <= MAX_ENTRIES_PER_ENGINE) return;

	for (const [key, entry] of cache) {
		if (cache.size <= MAX_ENTRIES_PER_ENGINE) break;
		// A retained entry has a mounted reader: dropping it would hand that reader a dead
		// subscription. The entry just handed out is never the one thrown away either.
		if (entry.refCount > 0 || entry === keep) continue;
		cache.delete(key);
		entry.resource.destroy();
	}
}

/**
 * The resource for one engine + key, built on first ask and handed back on every ask after.
 *
 * `createInput$` is called only on a miss — the key must therefore name everything the
 * observable depends on.
 */
export function acquireEngineResource<T>(
	engine: RxdbSyncEngine,
	key: string,
	createInput$: () => Observable<T>
): EngineResourceEntry<T> {
	let cache = cacheByEngine.get(engine);
	if (!cache) {
		cache = new Map<string, EngineResourceHandle>();
		cacheByEngine.set(engine, cache);
	}

	const existing = cache.get(key) as EngineResourceEntry<T> | undefined;
	if (existing) {
		// Re-insert so `Map` iteration order stays least-recently-asked-for first.
		cache.delete(key);
		cache.set(key, existing);
		return existing;
	}

	const entry: EngineResourceEntry<T> = {
		key,
		resource: new ObservableResource(createInput$()),
		refCount: 0,
		cache,
	};
	cache.set(key, entry);
	evictUnretained(cache, entry);
	return entry;
}

/** Claim the entry for a mounted consumer. Pairs with exactly one `releaseEngineResource`. */
export function retainEngineResource(entry: EngineResourceHandle): void {
	entry.refCount += 1;
}

/**
 * Drop a mounted consumer's claim. The last release destroys the resource and evicts it:
 * an engine record query is a live RxDB subscription and must not outlive its readers.
 */
export function releaseEngineResource(entry: EngineResourceHandle): void {
	entry.refCount = Math.max(0, entry.refCount - 1);
	if (entry.refCount > 0) return;

	if (entry.cache.get(entry.key) === entry) {
		entry.cache.delete(entry.key);
	}
	entry.resource.destroy();
}
