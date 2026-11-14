import * as React from 'react';

/** The rail asks; only the focused POS bar claims the panel request. */
let requested: 'register' | 'count' | null = null;
let pane: 'register' | 'count' = 'register';
const listeners = new Set<() => void>();

export function requestRegisterPanel(next: 'register' | 'count' = 'register') {
	requested = pane = next;
	listeners.forEach((listener) => listener());
}

export function consumeRegisterPanelRequest(): 'register' | 'count' | null {
	const was = requested;
	requested = null;
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
		() => requested !== null,
		() => false
	);
}

/** The claimed pane stays reactive while its one-shot request is consumed. */
export function useRegisterPanelPane() {
	return React.useSyncExternalStore(
		subscribe,
		() => pane,
		() => 'register' as const
	);
}
