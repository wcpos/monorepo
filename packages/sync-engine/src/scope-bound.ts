import type { ScopeBound, SyncObserver } from '@wcpos/sync-core';

/**
 * A row about work bound to `bound`: forwarded only while that ticket is
 * current (judged by epoch, so A→B→A drops it too). Work that awaits past a
 * store or cashier switch would otherwise log into the incoming scope.
 */
export function scopeBoundObserver(bound: ScopeBound, observer: SyncObserver): SyncObserver {
	return (event) => {
		if (bound.isCurrent()) observer(event);
	};
}
