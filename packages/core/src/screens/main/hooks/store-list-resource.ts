import { ObservableResource } from 'observable-hooks';

import type { StoreDocument, WPCredentialsDocument } from '@wcpos/database';

/**
 * The stores behind one set of credentials, as a Suspense resource that survives a retry.
 *
 * NOT a hook, deliberately. A Suspense resource built during render must NOT be held in
 * `useMemo`, `useState` or `useRef`, because all three live on the fiber: when a component
 * suspends before its subtree has ever committed, React unwinds to the boundary and throws
 * the work-in-progress fibers away, hook state included. The retry then re-runs the factory,
 * builds a *new* `ObservableResource`, and — since `ObservableResource` subscribes in its
 * constructor and `read()` throws a fresh promise until the first value lands — that new
 * resource suspends for exactly the reason its predecessor did. Each retry manufactures the
 * condition that triggers the next one, so the wait never ends on its own: it is a loop, not
 * a load.
 *
 * That loop is the Orders blank-body failure. `FilterBar` built the stores resource inline
 * (`useMemo(() => new ObservableResource(wpCredentials.populate$('stores')), [wpCredentials])`)
 * and `StorePill` consumed it with no boundary of its own, so the suspension escaped to the
 * per-route `Suspense` expo-router wraps every screen in — whose production fallback is
 * `null` (`expo-router/build/views/SuspenseFallback`, dev renders a "Bundling…" toast
 * instead). The cashier saw the Orders header paint and the body stay empty. Measured in the
 * app on 2026-08-30: `FilterBar` renders and resource constructions ran 1:1 on every
 * navigation to Orders (6/6, 13/13, 4/4, 8/8) while `StorePill` got past
 * `useObservableSuspense` only once or twice; on CI the same loop ran 7,746 times in ~100 s,
 * ~11 ms apart, and the screen never mounted (iOS tablet, run 33295532237, flow 05).
 *
 * Keying weakly on the credentials document — whose identity RxDB preserves — is what makes
 * the resource outlive the retry: the second attempt reads back the resource the first one
 * subscribed, so the first emission ends the wait for good. `WeakMap` rather than a plain
 * cache so a signed-out credential's resource is collectable with the document.
 */
const resourcesByCredentials = new WeakMap<
	WPCredentialsDocument,
	ObservableResource<StoreDocument[]>
>();

export function storeListResource(
	wpCredentials: WPCredentialsDocument
): ObservableResource<StoreDocument[]> {
	const existing = resourcesByCredentials.get(wpCredentials);
	if (existing) return existing;

	const resource = new ObservableResource(
		wpCredentials.populate$('stores'),
		(value) => !!value
	) as ObservableResource<StoreDocument[]>;
	resourcesByCredentials.set(wpCredentials, resource);
	return resource;
}
