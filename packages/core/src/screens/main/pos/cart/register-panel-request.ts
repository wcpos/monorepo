import * as React from 'react';

/** The rail asks; only the focused POS bar claims the panel request. */
let requested = false;
const listeners = new Set<() => void>();

export function requestRegisterPanel() {
	requested = true;
	listeners.forEach((listener) => listener());
}

export function consumeRegisterPanelRequest(): boolean {
	const was = requested;
	requested = false;
	if (was) listeners.forEach((listener) => listener());
	return was;
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useRegisterPanelRequested(): boolean {
	return React.useSyncExternalStore(
		subscribe,
		() => requested,
		() => false
	);
}
