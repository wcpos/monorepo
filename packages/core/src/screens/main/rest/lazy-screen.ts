import * as React from 'react';

import { retryableLazy } from '@wcpos/components/lib/retryable-lazy';
// Use the alias so route tests can mock the same module name.
import { loadRest } from '@wcpos/core/screens/main/rest/lazy';

type Rest = Awaited<ReturnType<typeof loadRest>>;

// See retryableLazy for rejected chunk handling.
export function lazyRest<P extends object>(
	pick: (rest: Rest) => React.ComponentType<P>
): React.ComponentType<P> {
	return retryableLazy(() => loadRest().then((rest) => ({ default: pick(rest) })));
}
