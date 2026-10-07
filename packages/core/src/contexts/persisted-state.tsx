import * as React from 'react';

const PersistedStateContext = React.createContext<Map<string, unknown> | null>(null);

/**
 * A bag of values that outlive the components that made them, for as long as this provider is
 * mounted. The register's two layouts (the phone's tabs, the rail's columns) are two trees, and
 * a window resized across the boundary unmounts one and mounts the other: a products screen
 * remounted that way would start again from the catalogue's root with its filters, search and
 * browse path gone (owner, 2026-10-07: "when I resize the screen, past a certain breakpoint, it
 * resets the current breadcrumbs"). The screen's state lives here instead, keyed, and the new
 * mount picks it up where the old one left it.
 *
 * Mounted once by the POS layout, which spans both trees. Not a store: nothing subscribes to
 * the bag, it only hands a keyed value back to whoever asks for it.
 */
export function PersistedStateProvider({ children }: { children: React.ReactNode }) {
	const [bag] = React.useState(() => new Map<string, unknown>());
	return <PersistedStateContext.Provider value={bag}>{children}</PersistedStateContext.Provider>;
}

/**
 * Whether a `PersistedStateProvider` is above: whether `usePersistedState` with a key is shared
 * across mounts here, or ordinary component state. A caller that skips its own teardown
 * because another mount will pick the value up must know which.
 */
export function useIsPersisted(): boolean {
	return React.useContext(PersistedStateContext) !== null;
}

/**
 * Component state that survives its component: under a `PersistedStateProvider`, the value for
 * `key` is created once and handed back to every later mount that asks for the same key. No
 * provider above, or no key: ordinary component state (`useState(create)`), so a component
 * rendered elsewhere (a test, another host) is unchanged. A key that changes while mounted
 * (another scope) hands back that key's value on the same render, as a remount would.
 */
export function usePersistedState<T>(key: string | undefined, create: () => T): T {
	const bag = React.useContext(PersistedStateContext);
	const lookup = (): T => {
		if (!bag || key === undefined) return create();
		if (!bag.has(key)) bag.set(key, create());
		return bag.get(key) as T;
	};
	// React's "previous render" pattern: the slot follows the key.
	const [slot, setSlot] = React.useState(() => ({ key, value: lookup() }));
	if (slot.key !== key) {
		const next = { key, value: lookup() };
		setSlot(next);
		return next.value;
	}
	return slot.value;
}
