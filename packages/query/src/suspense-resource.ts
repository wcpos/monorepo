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
 * engine + record ids, because those resources have a natural identity. A query binding has
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
 * What is left in the cache is only ever unclaimed: entries from renders that were discarded.
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
	exclusiveGroup?: string;
	/** Monotonic, so eviction drops the least recently asked-for entry. */
	lastAcquired: number;
};

const bucketsByScope = new WeakMap<object, Map<string, BridgeEntry<any>>>();
/** Reverse lookup, so a committing reader can claim its resource out of the bridge. */
const entryByResource = new WeakMap<ObservableResource<any>, BridgeEntry<any>>();
let acquisitionClock = 0;

function destroyEntry(entry: BridgeEntry<any>): void {
	if (entry.bucket.get(entry.key) === entry) entry.bucket.delete(entry.key);
	entryByResource.delete(entry.resource);
	entry.resource.destroy();
}

function evictOldest(bucket: Map<string, BridgeEntry<any>>): void {
	if (bucket.size <= MAX_ENTRIES_PER_SCOPE) return;
	const oldestFirst = Array.from(bucket.values()).sort((a, b) => a.lastAcquired - b.lastAcquired);
	for (const entry of oldestFirst) {
		if (bucket.size <= MAX_ENTRIES_PER_SCOPE) break;
		destroyEntry(entry);
	}
}

function bridgeAcquire<T>(
	scope: object,
	key: string,
	input$: Observable<T>,
	exclusiveGroup?: string
): ObservableResource<T> {
	let bucket = bucketsByScope.get(scope);
	if (!bucket) {
		bucket = new Map();
		bucketsByScope.set(scope, bucket);
	}
	if (exclusiveGroup) {
		for (const entry of bucket.values()) {
			if (entry.exclusiveGroup === exclusiveGroup && entry.key !== key) destroyEntry(entry);
		}
	}
	const existing = bucket.get(key) as BridgeEntry<T> | undefined;
	if (existing) {
		existing.lastAcquired = ++acquisitionClock;
		return existing.resource;
	}
	let entry: BridgeEntry<T> | undefined;
	const resource = new ObservableResource(
		input$.pipe(
			tap({
				error: () => {
					// A synchronous error can arrive before `entry` is assigned. Defer removal so
					// ErrorBoundary retry cannot reacquire the resource that latched that error.
					void Promise.resolve().then(() => {
						if (entry && entryByResource.get(entry.resource) === entry) destroyEntry(entry);
					});
				},
			})
		)
	);
	entry = {
		resource,
		bucket,
		key,
		exclusiveGroup,
		lastAcquired: ++acquisitionClock,
	};
	bucket.set(key, entry);
	entryByResource.set(entry.resource, entry);
	evictOldest(bucket);
	return entry.resource;
}

/**
 * Take a bridged resource out of the cache. `false` means another reader that committed on the
 * same attempt got there first, so this one owns nothing and must build its own.
 */
function bridgeClaim(resource: ObservableResource<any>): boolean {
	const entry = entryByResource.get(resource);
	if (!entry) return false;
	if (entry.bucket.get(entry.key) === entry) entry.bucket.delete(entry.key);
	entryByResource.delete(resource);
	return true;
}

/**
 * An `ObservableResource` that a Suspense retry cannot rebuild.
 *
 * @param scope Object whose lifetime bounds the bridge — an engine, a database, a collection.
 * @param inputKey Identity of `input$`: everything the observable is derived from, spelled out.
 *   Attempts that agree on this key share a resource; once the consumer has committed, a change
 *   here RELOADS its resource in place rather than replacing it, which is what keeps a
 *   descriptor change from blanking a mounted consumer.
 * @param input$ The observable to subscribe. Its reference must remain stable while `inputKey`
 *   is unchanged; a new reference after commit reloads the resource and resubscribes the query.
 * @param exclusiveGroup Optional identity for a bridge that has only one current input key.
 *   Acquiring a new key destroys an older unclaimed resource in the same group.
 */
export function useSuspenseResource<T>(
	scope: object,
	inputKey: string,
	input$: Observable<T>,
	exclusiveGroup?: string
): ObservableResource<T> {
	// The initialiser runs on every attempt, because a discarded attempt takes this state with
	// it — which is the whole point: every attempt lands on the same bridged resource, and the
	// first emission of THAT one ends the wait instead of starting the next attempt. `owned`
	// marks a resource this hook BUILT rather than took from the bridge, so the effect below
	// cannot try (and fail) to claim it and replace it again, forever.
	const [held, setHeld] = React.useState<{ resource: ObservableResource<T>; owned: boolean }>(
		() => ({ resource: bridgeAcquire<T>(scope, inputKey, input$, exclusiveGroup), owned: false })
	);
	const resource = held.resource;
	const bound = React.useRef<{ resource: ObservableResource<T>; input$: Observable<T> } | null>(
		null
	);
	const claimedResource = React.useRef<ObservableResource<T> | null>(null);
	const raceReplacement = React.useRef<{
		shared: ObservableResource<T>;
		held: { resource: ObservableResource<T>; owned: true };
	} | null>(null);
	const cleanupStateRef = React.useRef({ version: 0 });

	React.useEffect(() => {
		const cleanupState = cleanupStateRef.current;
		const version = ++cleanupState.version;
		let ownedResource = held.resource;
		if (!held.owned && claimedResource.current !== held.resource && !bridgeClaim(held.resource)) {
			// Another reader committed on this bridged resource first and now owns it — it will
			// reload and destroy it on its own schedule, so binding to it here would be reading
			// someone else's subscription. Rare: it takes two consumers with identical inputs
			// suspending and committing together. The loser subscribes the SAME observable (the
			// winner's `input$`, equivalent to ours by construction — a difference would have
			// changed `inputKey` and given us different resources in the first place).
			//
			// Losing the race is an EVENT, not derived render data: claiming consumes a one-shot
			// external entry and can only happen post-commit. The extra render is safe because
			// this component has committed, so its state survives the suspension that follows.
			if (raceReplacement.current?.shared !== held.resource) {
				raceReplacement.current = {
					shared: held.resource,
					held: { resource: new ObservableResource(held.resource.input$), owned: true },
				};
			}
			ownedResource = raceReplacement.current.held.resource;
			setHeld(raceReplacement.current.held);
		} else if (!held.owned) {
			claimedResource.current = held.resource;
		}
		// Claimed: this resource is now ordinary component state, owned by this consumer, and
		// it holds the live subscription behind the binding. Strict Mode immediately replays an
		// effect's setup after its cleanup, so defer destruction one microtask: the replay bumps
		// this version and keeps the same subscription; a real unmount does not and destroys it.
		return () => {
			void Promise.resolve().then(() => {
				if (cleanupState.version === version) ownedResource.destroy();
			});
		};
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
