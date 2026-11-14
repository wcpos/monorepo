import * as React from 'react';

import { useIsPhone } from '../device';

type ProvidedHost = { name: string; phoneUsesRoot: boolean; outer: ProvidedHost | undefined };

const OverlayHostContext = React.createContext<ProvidedHost | undefined>(undefined);

/**
 * Names the host the overlays below render on, without mounting it: `OverlayHost` (`./host`, kept
 * apart because it brings the error boundary and the native portal) names its own, and a surface
 * above every screen (the desktop title bar) names the focused page's. `undefined` names the root.
 * `phoneUsesRoot`: a phone takes the root instead (a page host beside a rail it does not have).
 */
export function OverlayHostProvider({
	name,
	phoneUsesRoot = false,
	children,
}: React.PropsWithChildren<{ name: string | undefined; phoneUsesRoot?: boolean }>) {
	const outer = React.useContext(OverlayHostContext);
	const value = React.useMemo(
		() => (name === undefined ? undefined : { name, phoneUsesRoot, outer }),
		[name, phoneUsesRoot, outer]
	);
	return <OverlayHostContext.Provider value={value}>{children}</OverlayHostContext.Provider>;
}

/**
 * The host an overlay below renders on when it names none: the nearest one provided, or with
 * `outermost` the outermost (the page's, under a till's nested host); `undefined` is the root,
 * as it is with none provided or on a phone under a `phoneUsesRoot` host.
 */
export function useOverlayHost(scope: 'nearest' | 'outermost' = 'nearest'): string | undefined {
	let host = React.useContext(OverlayHostContext);
	const phone = useIsPhone();
	if (scope === 'outermost') while (host?.outer) host = host.outer;
	return host && !(host.phoneUsesRoot && phone) ? host.name : undefined;
}
