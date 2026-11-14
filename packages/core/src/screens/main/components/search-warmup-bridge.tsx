import * as React from 'react';

import { useQueryRuntime, warmSearchBlobs } from '@wcpos/query';

/**
 * Builds the catalogue search blobs at till-open instead of on the first keystroke
 * (#1733). Mounted beside the other engine bridges, inside the QueryProvider, because
 * search readiness is a property of the session, not of any one screen.
 */
export function SearchWarmupBridge() {
	const runtime = useQueryRuntime();
	React.useEffect(() => warmSearchBlobs(runtime.engine), [runtime.engine]);
	return null;
}
