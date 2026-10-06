import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import type { Observable } from 'rxjs';

const NO_EXTEND = () => {};

/**
 * A browse level's end-reached handler: `extend` (the guarded extension, #1221) when the level
 * owns the query, nothing when it does not (a level a child is over, or one showing only its
 * subcategories).
 *
 * The guard ignores an end-reached while the demand is pending, but the list counts that content
 * length as notified and will not fire again for it (FlashList on native, the level grid's
 * FlatList): when pending clears over the same rows, paging would stall until the cashier
 * scrolls away and back — impossible on a short page. So an end-reached while pending is armed,
 * and fired once when pending clears. A level that stops owning the query meanwhile fires it at
 * nothing.
 */
export function useArmedEndReached(
	extend: () => void,
	pending$: Observable<boolean>,
	owned: boolean
): () => void {
	const pending = useObservableEagerState(pending$);
	const armed = React.useRef(false);
	const extendOwned = owned ? extend : NO_EXTEND;
	const onEndReached = React.useCallback(() => {
		if (pending) armed.current = true;
		else extendOwned();
	}, [extendOwned, pending]);
	React.useEffect(() => {
		if (pending || !armed.current) return;
		armed.current = false;
		extendOwned();
	}, [extendOwned, pending]);
	return onEndReached;
}
