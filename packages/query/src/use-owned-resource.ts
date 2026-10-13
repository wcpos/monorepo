import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { ReplaySubject } from 'rxjs';
import { switchMap, take } from 'rxjs/operators';

import type { Observable } from 'rxjs';

/** A resource whose read waits for `open()`: built in render, it subscribes nothing there. */
type Held<T> = { resource: ObservableResource<T>; open: () => void };

function gated<T>(source: Observable<T>): Held<T> {
	const opened = new ReplaySubject<void>(1);
	return {
		resource: new ObservableResource(
			opened.pipe(
				take(1),
				switchMap(() => source)
			)
		),
		open: () => opened.next(),
	};
}

/**
 * A Suspense resource over `source$`, owned by the calling component: its read starts when the
 * component commits (an effect, never a render), it follows a changed `source$` by reloading (the
 * current value stays while the new one loads), and it is destroyed on unmount.
 *
 * Strict Mode safe. An `ObservableResource` subscribes on construction, and Strict Mode both
 * invokes a hook's initializer twice (discarding one result) and replays the mount effect's
 * cleanup and setup over the same state. So the resource built in render is GATED — the
 * discarded twin never reads — and the replayed setup, finding the held resource destroyed by
 * the replayed cleanup, builds ONE live replacement itself and hands it to a reducer that only
 * stores it: one live read of `source$` after the replay, and a live resource for the readers.
 */
export type OwnedResource<T> = {
	resource: ObservableResource<T>;
	/**
	 * Read `source$` again after a failure, for the owner's ErrorBoundary reset (call it in
	 * `onReset`, before the readers remount). A resource holding a value reloads, which clears
	 * its error and keeps the value while the source answers. One that failed before its first
	 * value cannot suspend again (`ObservableResource.reload` only re-suspends a resource that
	 * is still suspended, so its readers would read `undefined`): it is replaced by a fresh one,
	 * which suspends them until the source answers.
	 */
	retry: () => void;
};

export function useOwnedResource<T>(source$: Observable<T>): OwnedResource<T> {
	const [held, replace] = React.useReducer((_held: Held<T>, next: Held<T>) => next, source$, gated);
	const heldRef = React.useRef(held);
	const sourceRef = React.useRef(source$);
	// The source the held resource reads now: what a changed `source$` reloads it from.
	const loadedRef = React.useRef(source$);
	React.useEffect(() => {
		heldRef.current = held;
		sourceRef.current = source$;
	});

	React.useEffect(() => {
		const current = heldRef.current;
		if (current.resource.isDestroyed) {
			const next = gated(sourceRef.current);
			loadedRef.current = sourceRef.current;
			next.open();
			replace(next);
		} else {
			current.open();
		}
		return () => heldRef.current.resource.destroy();
	}, []);

	React.useEffect(() => {
		// Reloading keeps the current value while the new source loads and clears terminal errors.
		if (loadedRef.current === source$) return;
		loadedRef.current = source$;
		held.resource.reload(source$);
	}, [held, source$]);

	const retry = React.useCallback(() => {
		const current = heldRef.current;
		if (current.resource.isDestroyed) return;
		if (current.resource.valueRef$$.value !== undefined) {
			current.resource.reload();
			return;
		}
		const next = gated(sourceRef.current);
		loadedRef.current = sourceRef.current;
		heldRef.current = next;
		next.open();
		current.resource.destroy();
		replace(next);
	}, []);

	return { resource: held.resource, retry };
}
