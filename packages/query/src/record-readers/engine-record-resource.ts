import { ObservableResource } from 'observable-hooks';
import { tap } from 'rxjs/operators';

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
 * Keying the resource on the scope plus the record identity is what makes it outlive the
 * retry: the second attempt reads back the resource the first one subscribed, so the first
 * emission ends the wait for good.
 *
 * IDENTITY IS THE SCOPE, NOT THE ENGINE. A same-site store or cashier switch mutates the
 * engine in place — `switchAppEngineScope` calls `engine.scope.switch()` and
 * `createAppSyncEngine` hands the SAME engine object back (`apps/main/lib/create-app-engine.ts`)
 * — so a cache keyed on the engine alone would serve store A's customer 42 to a component
 * mounting in store B. Every key therefore carries `active().scopeId`, and a scope change
 * sweeps the unretained entries of the scope being left. The `WeakMap` on the engine is what
 * lets a disposed engine's cache be collected whole.
 *
 * A FAILED RESOURCE IS NEVER SERVED TWICE. `ObservableResource` latches an error and `read()`
 * rethrows it forever, so a stream that fails before its first value — a transient storage
 * fault, a database closing under the query — would otherwise poison the key: the consumer
 * never committed, so nothing releases the entry, and resetting the error boundary or
 * remounting the route would read the same dead resource back. The input is tapped: an error,
 * or a completion with no value at all (which `ObservableResource` turns into "Suspender
 * ended unexpectedly"), drops the entry, so the next render builds a live one and the screen
 * recovers when storage does.
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

/** Stands in for `scopeId` while no scope is open (boot, logged out, mid-teardown). */
const NO_SCOPE = 'no-scope';

/**
 * A cached entry seen without its value type — what the cache and the retain/release
 * bookkeeping need. `ObservableResource<T>` is invariant in `T` (its `valueRef$$` exposes an
 * observers array), so the generic entry cannot be widened to `unknown`; it narrows this.
 */
export interface EngineResourceHandle {
	/** The scoped key this entry is filed under. */
	readonly key: string;
	readonly resource: { readonly isDestroyed: boolean; destroy(): void };
	/** Mounted consumers holding this entry. Zero means nothing has committed on it (yet). */
	refCount: number;
	/** The cache this entry lives in, so a release can evict itself without the engine. */
	readonly cache: EngineResourceCache;
}

export interface EngineResourceEntry<T> extends EngineResourceHandle {
	readonly resource: ObservableResource<T>;
}

interface EngineResourceCache {
	/** Least recently asked-for first — the eviction order. */
	readonly entries: Map<string, EngineResourceHandle>;
	/** The scope the unscoped entries belong to; a change sweeps what nothing is holding. */
	scopeId: string;
}

const cacheByEngine = new WeakMap<RxdbSyncEngine, EngineResourceCache>();

function evictUnretained(cache: EngineResourceCache, keep: EngineResourceHandle): void {
	if (cache.entries.size <= MAX_ENTRIES_PER_ENGINE) return;

	for (const [key, entry] of cache.entries) {
		if (cache.entries.size <= MAX_ENTRIES_PER_ENGINE) break;
		// A retained entry has a mounted reader: dropping it would hand that reader a dead
		// subscription. The entry just handed out is never the one thrown away either.
		if (entry.refCount > 0 || entry === keep) continue;
		cache.entries.delete(key);
		entry.resource.destroy();
	}
}

/**
 * Release the query subscriptions of the scope being left.
 *
 * Only the unretained ones: an entry a mounted consumer is still holding stays until that
 * consumer unmounts or re-renders onto the new scope's key, and its observable re-resolves
 * the collection on the `db$` emission the switch publishes.
 */
function sweepOutgoingScope(cache: EngineResourceCache): void {
	for (const [key, entry] of cache.entries) {
		if (entry.refCount > 0) continue;
		cache.entries.delete(key);
		entry.resource.destroy();
	}
}

/**
 * The resource for one scope + key, built on first ask and handed back on every ask after.
 *
 * `createInput$` is called only on a miss — the key must therefore name everything the
 * observable depends on, the scope aside (this adds that).
 */
export function acquireEngineResource<T>(
	engine: RxdbSyncEngine,
	key: string,
	createInput$: () => Observable<T>
): EngineResourceEntry<T> {
	const scopeId = engine.active()?.scopeId ?? NO_SCOPE;

	let cache = cacheByEngine.get(engine);
	if (!cache) {
		cache = { entries: new Map<string, EngineResourceHandle>(), scopeId };
		cacheByEngine.set(engine, cache);
	}
	if (cache.scopeId !== scopeId) {
		sweepOutgoingScope(cache);
		cache.scopeId = scopeId;
	}
	const resolvedCache = cache;
	const scopedKey = `${scopeId}|${key}`;

	const existing = resolvedCache.entries.get(scopedKey) as EngineResourceEntry<T> | undefined;
	if (existing && !existing.resource.isDestroyed) {
		// Re-insert so `Map` iteration order stays least-recently-asked-for first.
		resolvedCache.entries.delete(scopedKey);
		resolvedCache.entries.set(scopedKey, existing);
		return existing;
	}
	if (existing) {
		resolvedCache.entries.delete(scopedKey);
	}

	// Set by the tap below when the stream fails before this entry can be of use to anyone.
	// A failure can arrive synchronously, inside the constructor and so before there is an
	// entry to drop, which is why it is a flag consulted after construction as well.
	let emitted = false;
	let failed = false;
	const holder: { entry?: EngineResourceEntry<T> } = {};
	const dropFailed = () => {
		failed = true;
		const entry = holder.entry;
		if (entry && resolvedCache.entries.get(scopedKey) === entry) {
			resolvedCache.entries.delete(scopedKey);
		}
	};

	const entry: EngineResourceEntry<T> = {
		key: scopedKey,
		resource: new ObservableResource(
			createInput$().pipe(
				tap({
					next: () => {
						emitted = true;
					},
					error: dropFailed,
					complete: () => {
						if (!emitted) dropFailed();
					},
				})
			)
		),
		refCount: 0,
		cache: resolvedCache,
	};
	holder.entry = entry;

	if (!failed) {
		resolvedCache.entries.set(scopedKey, entry);
		evictUnretained(resolvedCache, entry);
	}
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

	if (entry.cache.entries.get(entry.key) === entry) {
		entry.cache.entries.delete(entry.key);
	}
	entry.resource.destroy();
}
