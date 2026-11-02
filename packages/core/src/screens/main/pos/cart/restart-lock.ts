import * as React from 'react';

/**
 * Once a local-data clear is scheduled on a build that cannot restart itself, the register
 * must stay frozen until the relaunch: anything sold after the confirm is destroyed by the
 * pre-hydration clear on the next launch. The confirm can be pressed from the register bar,
 * the management bars or the lg rail, all of which unmount on navigation or a breakpoint
 * change, so the lock lives here, outside React, and the drawer layout renders the overlay.
 */
let locked = false;
const listeners = new Set<() => void>();

export function lockForRestart() {
	locked = true;
	listeners.forEach((listener) => listener());
}

/** Tests only: the lock is one-way in the app, a relaunch clears it. */
export function resetRestartLockForTests() {
	locked = false;
	listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useRestartLocked(): boolean {
	return React.useSyncExternalStore(
		subscribe,
		() => locked,
		() => false
	);
}
