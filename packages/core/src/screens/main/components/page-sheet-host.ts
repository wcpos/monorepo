import * as React from 'react';

import { useIsPhone } from '@wcpos/components/lib/device';

/** The drawer screen's own host name, provided by the drawer layout's `Scene`; `undefined` outside one. */
export const PageSheetHostContext = React.createContext<string | undefined>(undefined);

// The focused screen's host, for a sheet whose owner sits above every screen (the desktop title
// bar's bell and cashier sheet): `Scene` publishes its host when it takes focus. Never cleared on
// blur, which would race the next screen's focus; the next focus overwrites it.
let focusedHost: string | undefined;
const listeners = new Set<() => void>();

export function setFocusedPageSheetHost(host: string | undefined) {
	focusedHost = host;
	listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
	listeners.add(notify);
	return () => {
		listeners.delete(notify);
	};
}

/**
 * The host a drawer page's sheet renders into: on wide the page's own `Scene` host (one per drawer
 * screen, so a sheet left open hides with its page and never follows the cashier onto the next
 * one), beside the rail and over the page bar, as the page bar's cashier sheet (#3061); a phone
 * has no rail, so the root. Above every screen (the title bar) it is the focused screen's host.
 * The POS passes its own `pos` host instead. A page never mounts a host of its own.
 */
export function usePageSheetHost(): string | undefined {
	const own = React.useContext(PageSheetHostContext);
	const focused = React.useSyncExternalStore(
		subscribe,
		() => focusedHost,
		() => undefined
	);
	return useIsPhone() ? undefined : (own ?? focused);
}
