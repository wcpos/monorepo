import * as React from 'react';

import { useQueryState } from './query-state-store';

const selectLimit = (state: { limit: number }): number => state.limit;

/**
 * End-reached → extendLimit, guarded (#1221).
 *
 * A result shorter than the current limit means one of two things, and both forbid another
 * extension: the server has no more matching rows (a short page IS the end), or the fetch for
 * the current limit is still landing (the extension is already outstanding). Unguarded, the
 * virtualizer's end-reached churn (short/empty content, re-measure, ResizeObserver) grew the
 * limit on every fire; each growth recompiled the search demand, and every recompile aborted
 * the in-flight wire request and immediately re-issued an identical one.
 *
 * Once the outstanding fetch lands enough rows to fill the limit, the data change re-arms the
 * virtualizer's end-reached and the next fire extends again — so paging through a long result
 * set still walks limit-by-limit, one outstanding extension at a time.
 */
export function useGuardedExtendLimit(extendLimit: () => void, resultCount: number): () => void {
	const limit = useQueryState(selectLimit);
	const extensionScheduled = React.useRef(false);
	React.useEffect(() => {
		extensionScheduled.current = false;
	}, [limit]);
	return React.useCallback(() => {
		if (resultCount < limit || extensionScheduled.current) return;
		extensionScheduled.current = true;
		extendLimit();
	}, [extendLimit, limit, resultCount]);
}
