import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import type { Observable } from 'rxjs';

/**
 * A browse level's end-reached handler: `extend` (the guarded extension, #1221) when the level
 * owns the query, nothing when it does not (a level a child is over, or one showing only its
 * subcategories).
 *
 * The guard ignores an end-reached while the demand is pending, but the list counts that content
 * length as notified and will not fire again for it (FlashList on native, the level grid's
 * FlatList): when pending clears over the same rows, paging would stall until the cashier
 * scrolls away and back — impossible on a short page. So an end-reached while pending is armed,
 * and fired once when pending clears.
 *
 * A level that does not own the query (`!owned`: a child is open over it) neither spends nor
 * drops an arm. The arm is kept — not fired at nothing — because the list under the child has
 * already counted its content length as notified: an arm spent while covered, or an end-reached
 * dropped then, leaves the level stuck on its first window when the child closes, with nothing
 * to fire it again. So while covered, an end-reached arms, and the arm waits; when the level
 * owns the query again (and pending is clear, and it is in the viewport) it fires once.
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
	const onEndReached = React.useCallback(() => {
		if (pending || !inViewport.current || !owned) armed.current = true;
		else extend();
	}, [extend, pending, owned]);
	// Re-runs when ownership returns (`owned`), when pending clears, and when the guarded
	// extension is rebuilt (`extend`): any of these can be the moment the arm is due.
	React.useEffect(() => {
		if (pending || !inViewport.current || !owned || !armed.current) return;
		armed.current = false;
		extend();
	}, [extend, pending, owned]);
	const onViewport = React.useCallback(
		(height: number) => {
			inViewport.current = height > 0;
			if (pending || !inViewport.current || !owned || !armed.current) return;
			armed.current = false;
			extend();
		},
		[extend, pending, owned]
	);
	return { onEndReached, onViewport };
}
