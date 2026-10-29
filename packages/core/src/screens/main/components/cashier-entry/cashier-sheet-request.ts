import * as React from 'react';

/** The store title asks; only a focused cashier entry claims the sheet request. */
let requested = false;
const listeners = new Set<() => void>();

export function requestCashierSheet() {
	requested = true;
	listeners.forEach((listener) => listener());
}

export function consumeCashierSheetRequest(): boolean {
	const was = requested;
	requested = false;
	if (was) listeners.forEach((listener) => listener());
	return was;
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useCashierSheetRequested(): boolean {
	return React.useSyncExternalStore(
		subscribe,
		() => requested,
		() => false
	);
}
