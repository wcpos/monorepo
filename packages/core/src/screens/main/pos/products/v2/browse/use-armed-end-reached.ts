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
 *
 * `measuresViewport`: the list reports its viewport through `onViewport(height)` (its layout),
 * and has none until a positive height is measured. A screen kept mounted but inactive lays out
 * at zero size, and zero geometry reads as the end: an end-reached then is held the same way —
 * armed, never extended — and fired once a positive viewport is back. So the hidden screen never
 * pages the shared query, and a short page does not stall when it shows again.
 */
export function useArmedEndReached(
	extend: () => void,
	pending$: Observable<boolean>,
	owned: boolean,
	{ measuresViewport = false }: { measuresViewport?: boolean } = {}
): { onEndReached: () => void; onViewport: (height: number) => void } {
	const pending = useObservableEagerState(pending$);
	const armed = React.useRef(false);
	const inViewport = React.useRef(!measuresViewport);
	const extendOwned = owned ? extend : NO_EXTEND;
	const onEndReached = React.useCallback(() => {
		if (pending || !inViewport.current) armed.current = true;
		else extendOwned();
	}, [extendOwned, pending]);
	React.useEffect(() => {
		if (pending || !inViewport.current || !armed.current) return;
		armed.current = false;
		extendOwned();
	}, [extendOwned, pending]);
	const onViewport = React.useCallback(
		(height: number) => {
			inViewport.current = height > 0;
			if (pending || !inViewport.current || !armed.current) return;
			armed.current = false;
			extendOwned();
		},
		[extendOwned, pending]
	);
	return { onEndReached, onViewport };
}
