import * as React from 'react';

import { useIsPhone } from '@wcpos/components/lib/device';

/** The drawer screen's own host name, provided by the drawer layout's `Scene`; `undefined` outside one. */
export const PageSheetHostContext = React.createContext<string | undefined>(undefined);

/**
 * The host a drawer page's sheet renders into: on wide the page's own `Scene` host (one per drawer
 * screen, so a sheet left open hides with its page and never follows the cashier onto the next
 * one), beside the rail and over the page bar, as the page bar's cashier sheet (#3061); a phone
 * has no rail, so the root. The POS passes its own `pos` host instead. A page never mounts a
 * host of its own.
 */
export function usePageSheetHost(): string | undefined {
	const host = React.useContext(PageSheetHostContext);
	return useIsPhone() ? undefined : host;
}
