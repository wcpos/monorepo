import * as React from 'react';

import { type ObservableResource, useObservableEagerState } from 'observable-hooks';

/**
 * Whether a resource has stopped waiting for its first answer, for a caller that awaits it
 * OUTSIDE Suspense. Suspending on a local resource commits the fallback, and React holds a
 * committed fallback for 300 ms; awaited here instead, the swap is immediate.
 *
 * "Answered" includes a resource that failed or completed without a value: its `read()` is
 * what rethrows the failure, so the caller must mount the component that reads it (inside its
 * error boundary) rather than hold a skeleton forever.
 */
export function useFirstAnswer<TInput, TOutput extends TInput>(
	resource: ObservableResource<TInput, TOutput>
): boolean {
	const [, settled] = React.useReducer((count: number) => count + 1, 0);
	// eslint-disable-next-line wcpos/no-dollar-getter-into-observable-hooks -- ObservableResource exposes a stable BehaviorSubject property, not an RxDB $-getter; exception dated 2026-10-01.
	useObservableEagerState(resource.valueRef$$);
	// Read from the subject itself: on the render where `resource` changes, the hook above can
	// still hold the previous resource's state.
	const valued = resource.valueRef$$.value !== undefined;
	let waiting: PromiseLike<unknown> | null = null;
	if (!valued) {
		try {
			resource.read();
		} catch (thrown) {
			// A thenable is the suspender; anything else is the failure the reader will rethrow.
			if (typeof (thrown as PromiseLike<unknown> | null)?.then === 'function') {
				waiting = thrown as PromiseLike<unknown>;
			}
		}
	}
	React.useEffect(() => {
		if (!waiting) return;
		let live = true;
		// A value arrives through `valueRef$$`; this catches the suspender ending without one.
		void waiting.then(() => live && settled());
		return () => {
			live = false;
		};
	}, [waiting]);
	return !waiting;
}
