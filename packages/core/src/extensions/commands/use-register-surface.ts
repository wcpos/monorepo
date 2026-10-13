import * as React from 'react';

import { registerSurface } from './surfaces';

import type { SurfaceTarget } from './types';

/**
 * Registers a surface once on mount and invokes the LATEST handler. A passive effect keyed on the
 * handler would leave the previous one registered until it flushed, and a key landing in that
 * window would run the previous cart's path; the ref is updated in the commit phase, before any
 * event can fire. `enabled` false detaches it while the component stays mounted.
 */
export function useRegisterSurface(
	target: SurfaceTarget,
	handler: () => void | Promise<void>,
	enabled = true
) {
	const latest = React.useRef(handler);
	React.useLayoutEffect(() => {
		latest.current = handler;
	});
	React.useEffect(
		() => (enabled ? registerSurface(target, () => latest.current()) : undefined),
		[target, enabled]
	);
}
