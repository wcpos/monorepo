import * as React from 'react';

import { useIsPhone } from '@wcpos/components/lib/device';
import { useOverlayHost } from '@wcpos/components/lib/overlay-host';

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
 * has no rail, so the root (the host's `phoneUsesRoot`). It is the outermost host provided, so a
 * Reports sheet the till's register panel reuses keeps the page's, not the till's `pos`. Above
 * every screen (the title bar) it is the focused screen's host. The root is `null`, never
 * `undefined`, which a `DialogContent` reads as "the nearest host" (the till's, under the till).
 * A page never mounts a host of its own.
 */
export function usePageSheetHost(): string | null {
	const own = useOverlayHost('outermost');
	const focused = React.useSyncExternalStore(
		subscribe,
		() => focusedHost,
		() => undefined
	);
	const phone = useIsPhone();
	return own ?? (phone ? undefined : focused) ?? null;
}
