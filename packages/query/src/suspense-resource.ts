import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { tap } from 'rxjs/operators';

import type { Observable } from 'rxjs';

/**
 * A Suspense resource that survives a retry, for a binding with no document to key on.
 *
 * A Suspense resource built during render must NOT be held in `useMemo`, `useState` or
 * `useRef`, because all three live on the fiber: when a component suspends before its subtree
 * has ever committed, React unwinds to the boundary and throws the work-in-progress fibers
 * away, hook state included. The retry re-runs the factory, builds a *new*
 * `ObservableResource`, and — since `ObservableResource` subscribes in its constructor and
 * `read()` throws a fresh promise until the first value lands — that new resource suspends for
 * exactly the reason its predecessor did. Each attempt manufactures the condition that
 * triggers the next one, so the wait never ends on its own: it is a loop, not a load. That is
 * the Orders blank-body failure (monorepo#1707): on CI the loop ran 7,746 times in ~100 s,
 * ~11 ms apart, and the screen never mounted.
 *
 * `storeListResource` keys weakly on an RxDB document and `engine-record-resource` keys on
 * scope + record ids, because those resources have a natural identity. A query binding has
 * none, and nothing on the fiber can supply one — `React.useId()` included, which is a global
 * counter here, not a tree position: measured 2026-08-30, a suspending consumer got
 * `_r_0_`, `_r_2_`, `_r_4_`, … one fresh pair of ids per attempt. So the identity has to be
 * the INPUTS: a resource is a function of the observable it subscribes, and two callers asking
 * for the same thing are interchangeable.
 *
 * That leaves one problem, and the shape of this module is the answer to it. Keying by inputs
 * alone would hand a mounted table a brand new (empty, suspending) resource on every keystroke,
 * blanking the grid — where reloading the resource in place keeps the previous rows up while
 * the new query loads. So the cache is a BRIDGE, not a registry: it carries a resource across
 * the attempts that never commit, and the first render that DOES commit claims it out of the
 * cache and holds it in ordinary component state from then on, reloading it in place as the
 * query moves. Nothing that a mounted component owns is ever in this cache, so nothing here can
 * be handed to a second reader behind its owner's back.
 *
 * THE KEY MUST NAME THE SCOPE. A same-site store or cashier switch mutates the engine in place
 * — `switchAppEngineScope` calls `engine.scope.switch()` and `createAppSyncEngine` hands the
 * SAME engine object back — so the `scope` argument alone does not distinguish stores, and an
 * unclaimed entry left by an abandoned render in store A would be served to a render in store B
 * under the same inputs. Callers put `engine.active()?.scopeId` in `inputKey`, for the reason
 * `engine-record-resource` puts it in its own key (#1710).
 *
 * A FAILED RESOURCE IS NEVER SERVED TWICE. `ObservableResource` latches an error and `read()`
 * rethrows it forever, so a stream that fails before its first value — a transient storage
 * fault, a database closing under the query — would otherwise poison the slot: the consumer
 * never committed, so nothing claimed the entry, and resetting the error boundary or remounting
 * the route would read the same dead resource back. The input is tapped: an error, or a
 * completion with no value at all (which `ObservableResource` turns into "Suspender ended
 * unexpectedly"), drops the entry, so the next render builds a live one and the screen recovers
 * when storage does.
 *
 * What is left in the bridge is only ever unclaimed: entries from renders that were discarded.
 * `MAX_ENTRIES_PER_SCOPE` destroys the least recently asked-for of those on insert (the entry a
 * live retry keeps asking for is the most recent, so it is the last to go), and the outer
 * `WeakMap` drops a whole scope's bridge with the scope object — an engine, a database, a
 * collection — so a signed-out or switched-away scope is collectable.
 */
const MAX_ENTRIES_PER_SCOPE = 32;

type BridgeEntry<T> = {
	resource: ObservableResource<T>;
	bucket: Map<string, BridgeEntry<any>>;
	key: string;
};

const bucketsByScope = new WeakMap<object, Map<string, BridgeEntry<any>>>();
/** Reverse lookup, so a committing reader can claim its resource out of the bridge. */
const entryByResource = new WeakMap<ObservableResource<any>, BridgeEntry<any>>();
/**
 * The UNTAPPED observable a resource was built from. `resource.input$` is the tapped one, whose
 * only job is to drop a failed bridge entry; anything rebuilding should subscribe the caller's
 * observable rather than that bookkeeping wrapper. Weak, so it goes with the resource.
 */
const sourceByResource = new WeakMap<ObservableResource<any>, Observable<any>>();

function dropEntry(entry: BridgeEntry<any>): void {
	if (entry.bucket.get(entry.key) === entry) entry.bucket.delete(entry.key);
	entryByResource.delete(entry.resource);
}

function evictOldest(bucket: Map<string, BridgeEntry<any>>, keep: BridgeEntry<any>): void {
	if (bucket.size <= MAX_ENTRIES_PER_SCOPE) return;
	// `Map` iterates in insertion order and a hit re-inserts, so this is least-recently-asked-
	// for first — the entry a live retry keeps asking for is the last thing considered.
	for (const entry of bucket.values()) {
		if (bucket.size <= MAX_ENTRIES_PER_SCOPE) break;
		if (entry === keep) continue;
		dropEntry(entry);
		entry.resource.destroy();
	}
}

function bridgeAcquire<T>(
	scope: object,
	key: string,
	input$: Observable<T>
): ObservableResource<T> {
	let bucket = bucketsByScope.get(scope);
	if (!bucket) {
		bucket = new Map();
		bucketsByScope.set(scope, bucket);
	}
	const existing = bucket.get(key) as BridgeEntry<T> | undefined;
	if (existing && !existing.resource.isDestroyed) {
		// Re-insert so iteration order stays least-recently-asked-for first.
		bucket.delete(key);
		bucket.set(key, existing);
		return existing.resource;
	}
	if (existing) dropEntry(existing);

	// Set by the tap below when the stream fails before this entry can be of use to anyone. A
	// failure can arrive synchronously, inside the `ObservableResource` constructor and so
	// before there is an entry to drop, which is why it is also a flag read after construction.
	let emitted = false;
	let failed = false;
	const holder: { entry?: BridgeEntry<T> } = {};
	const dropFailed = () => {
		failed = true;
		if (holder.entry) dropEntry(holder.entry);
	};

	const entry: BridgeEntry<T> = {
		resource: new ObservableResource(
			input$.pipe(
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
		bucket,
		key,
	};
	holder.entry = entry;
	sourceByResource.set(entry.resource, input$);

	if (!failed) {
		bucket.set(key, entry);
		entryByResource.set(entry.resource, entry);
		evictOldest(bucket, entry);
	}
	return entry.resource;
}

/**
 * Take a bridged resource out of the cache. `false` means it is not there to take — another
 * reader that committed on the same attempt got there first.
 */
function bridgeClaim(resource: ObservableResource<any>): boolean {
	const entry = entryByResource.get(resource);
	if (!entry) return false;
	dropEntry(entry);
	return true;
}

/**
 * Teardowns an effect cleanup has scheduled and that have not run yet.
 *
 * The cleanup CANNOT destroy the subscription there and then, because React re-runs a mount
 * effect's setup immediately after its cleanup — every time under Strict Mode, and again on an
 * offscreen remount. Destroying eagerly and rebuilding in the next setup is not a fix either:
 * measured 2026-08-31, that rebuild is itself a new mount effect, which Strict Mode replays in
 * turn, so it destroys and rebuilds forever (599,072 subscribe/rebuild pairs before the test
 * timed out). Deferring makes setup/cleanup restartable instead: a replayed setup takes its own
 * teardown back and keeps the SAME live resource — no rebuild, no re-suspend, no duplicated
 * query work — while a real unmount, which has no setup to follow it, lets the teardown run.
 *
 * A MICROTASK is enough, and is the shortest deferral that works: React runs the replayed setup
 * synchronously right after the cleanup, inside the same commit (measured 2026-08-31:
 * `subscribe, setup, cleanup, setup` with no await between), so the cancellation always beats
 * the queued teardown. A real unmount therefore still releases the subscription within the same
 * task.
 */
const pendingTeardowns = new Set<ObservableResource<any>>();

function scheduleTeardown(resource: ObservableResource<any>): void {
	if (pendingTeardowns.has(resource)) return;
	pendingTeardowns.add(resource);
	queueMicrotask(() => {
		if (!pendingTeardowns.delete(resource)) return;
		resource.destroy();
	});
}

/** Take back a teardown this consumer scheduled a moment ago. True when there was one. */
function cancelTeardown(resource: ObservableResource<any>): boolean {
	return pendingTeardowns.delete(resource);
}

/**
 * An `ObservableResource` that a Suspense retry cannot rebuild.
 *
 * @param scope Object whose lifetime bounds the bridge — an engine, a database, a collection.
 * @param inputKey Identity of `input$`: everything the observable is derived from, spelled out,
 *   INCLUDING the engine scope where there is one (see the note above — a store switch keeps
 *   the same engine object). Attempts that agree on this key share a resource; once the consumer
 *   has committed, a change here RELOADS its resource in place rather than replacing it, which
 *   is what keeps a descriptor change from blanking a mounted consumer.
 * @param input$ The observable to subscribe. Read when the resource is created, and again on
 *   each reload, so re-deriving an equivalent observable every render costs nothing.
 */
export function useSuspenseResource<T>(
	scope: object,
	inputKey: string,
	input$: Observable<T>
): ObservableResource<T> {
	// The initialiser runs on every attempt, because a discarded attempt takes this state with
	// it — which is the whole point: every attempt lands on the same bridged resource, and the
	// first emission of THAT one ends the wait instead of starting the next attempt. `owned`
	// marks a resource this hook BUILT rather than took from the bridge, so the effect below
	// does not go looking for it there.
	const [held, setHeld] = React.useState<{ resource: ObservableResource<T>; owned: boolean }>(
		() => ({ resource: bridgeAcquire<T>(scope, inputKey, input$), owned: false })
	);
	const resource = held.resource;
	const bound = React.useRef<{ resource: ObservableResource<T>; input$: Observable<T> } | null>(
		null
	);
	/**
	 * The replacement built when this consumer lost the claim race, remembered against the
	 * resource it lost, so a replayed setup of that same losing effect reuses it rather than
	 * subscribing a second query and leaking the first.
	 */
	const raceReplacement = React.useRef<{
		lostTo: ObservableResource<T>;
		replacement: { resource: ObservableResource<T>; owned: true };
	} | null>(null);

	React.useEffect(() => {
		// A REPLAY of our own setup — Strict Mode, or an offscreen remount. The cleanup below
		// only ever SCHEDULES the teardown, so taking it back here keeps the same live resource
		// and this consumer never notices the round trip.
		if (cancelTeardown(held.resource)) {
			return () => scheduleTeardown(held.resource);
		}
		if (!held.resource.isDestroyed && (held.owned || bridgeClaim(held.resource))) {
			// Ours: this resource is now ordinary component state, owned by this consumer, and
			// it holds the live subscription behind the binding.
			return () => scheduleTeardown(held.resource);
		}
		// Falling through with a DESTROYED resource means a teardown really did run before this
		// setup — an offscreen remount separated by a real tick, which the deferral above cannot
		// bridge. Rebuilding below is the only option: `ObservableResource` cannot re-open a
		// destroyed subscription, and binding to it would freeze this consumer, since `read()`
		// throws "Resource has been destroyed" and `shouldUpdate$$` is already closed. (No test
		// covers this arm: nothing in the tree renders an `<Activity>`, and Strict Mode no longer
		// reaches it — it is a guard, not a behaviour anything depends on today.)
		// A RACE: another reader committed on this bridged resource first and now owns it — it
		// will reload and destroy it on its own schedule, so binding to it here would be reading
		// someone else's subscription. Rare: it takes two consumers with identical inputs
		// suspending and committing together. The loser subscribes the SAME observable,
		// equivalent to ours by construction — a difference would have changed `inputKey` and
		// given us different resources in the first place.
		//
		// Losing the race is an EVENT, not derived render data: claiming consumes a one-shot
		// external entry and can only happen post-commit. The extra render is safe because this
		// component has committed, so its state survives the suspension that follows.
		if (raceReplacement.current?.lostTo !== held.resource) {
			raceReplacement.current = {
				lostTo: held.resource,
				replacement: {
					resource: new ObservableResource(
						(sourceByResource.get(held.resource) as Observable<T> | undefined) ??
							held.resource.input$
					),
					owned: true,
				},
			};
		}
		setHeld(raceReplacement.current.replacement);
		return undefined;
	}, [held]);

	React.useEffect(() => {
		if (bound.current?.resource !== resource) {
			// First commit on this resource. It is subscribed to the observable the first
			// ATTEMPT built; this render re-derived an equivalent one — equivalent because a
			// change of inputs would have changed `inputKey` and produced a different resource —
			// so adopt it as the baseline rather than resubscribing an identical query.
			bound.current = { resource, input$ };
			return;
		}
		if (bound.current.input$ === input$) return;
		bound.current = { resource, input$ };
		// Reloading retains the current value while the new query loads and clears terminal
		// errors, so a descriptor change never blanks a mounted consumer.
		resource.reload(input$);
	}, [resource, input$]);

	return resource;
}
