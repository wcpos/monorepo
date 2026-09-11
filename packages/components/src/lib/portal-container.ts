import * as React from 'react';

const containers = new Map<string, HTMLElement | null>();
const subscribers = new Set<() => void>();

export function registerPortalContainer(name: string, element: HTMLElement | null) {
	if (element) containers.set(name, element);
	else containers.delete(name);
	subscribers.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
	subscribers.add(notify);
	return () => {
		subscribers.delete(notify);
	};
}

export function usePortalContainer(name?: string): HTMLElement | undefined {
	return React.useSyncExternalStore(
		subscribe,
		() => (name === undefined ? undefined : (containers.get(name) ?? undefined)),
		() => undefined
	);
}
