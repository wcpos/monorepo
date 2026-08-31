import * as React from 'react';

import { startSearchReadiness, useQueryRuntime } from '@wcpos/query';

/**
 * Builds the product and variation search indexes at till-open instead of on
 * the first keystroke, and periodically verifies the index can find a sampled
 * document by its own tokens (#1733). Mounted beside the other engine bridges,
 * inside the QueryProvider, because index readiness is a property of the
 * session, not of any one screen.
 */
export function SearchReadinessBridge() {
	const runtime = useQueryRuntime();
	React.useEffect(
		() => startSearchReadiness({ engine: runtime.engine, locale: runtime.locale }),
		[runtime.engine, runtime.locale]
	);
	return null;
}
