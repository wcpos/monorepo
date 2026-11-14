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

/**
 * Entries inside the till (a current order in context) that are focused. While one is, it claims
 * the request and an entry outside the till (the desktop title bar's) hands its press over, so the
 * sheet opens with the till's order and its register rows stay live (#3074).
 */
let tillEntries = 0;
export function useTillEntry(active: boolean): void {
	React.useEffect(() => {
		if (!active) return;
		tillEntries += 1;
		return () => {
			tillEntries -= 1;
		};
	}, [active]);
}
export function tillEntryFocused(): boolean {
	return tillEntries > 0;
}
