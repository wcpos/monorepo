import * as React from 'react';

import type { EngineRecord } from '@wcpos/query';

export type LevelAnswer = {
	hits: { record: EngineRecord<'products'> }[];
	/** The query total (the footer's and the crumb's number), not the loaded window. */
	total: number | undefined;
};

/**
 * What a level shows. The products query is shared by every level of the browse stage, so the
 * live answer is this level's only while the level is the deepest AND the answer was made under
 * its projection — `settled`, the stage's word. Otherwise the level holds the last answer that
 * was its own: while a child is dealt over it, and while the query gathers its set again on the
 * way back, the tiles on stage stay the tiles that came out.
 */
export function useLevelSnapshot(
	live: LevelAnswer | undefined,
	settled: boolean
): LevelAnswer | undefined {
	const own = settled && live !== undefined ? live : undefined;
	// Held in state, not a ref written during render: the last answer that was this level's.
	const [held, setHeld] = React.useState(own);
	if (own !== undefined && own !== held) setHeld(own);
	return own ?? held;
}
