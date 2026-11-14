/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { type LevelAnswer, useLevelSnapshot } from './level-snapshot';

const own = { hits: [{ record: { uuid: 'a' } }], total: 1 } as unknown as LevelAnswer;
const theirs = { hits: [{ record: { uuid: 'b' } }], total: 9 } as unknown as LevelAnswer;

it('takes the live answer while settled, holds it while not, and ignores a live answer that is not its own', () => {
	const { result, rerender } = renderHook(({ live, settled }) => useLevelSnapshot(live, settled), {
		initialProps: { live: undefined as LevelAnswer | undefined, settled: true },
	});
	// Cold: gathering.
	expect(result.current).toBeUndefined();
	rerender({ live: own, settled: true });
	expect(result.current).toBe(own);
	// A child level is over it; the query is the child's.
	rerender({ live: theirs, settled: false });
	expect(result.current).toBe(own);
	// On the way back: deepest again, the query gathering its set.
	rerender({ live: undefined, settled: true });
	expect(result.current).toBe(own);
	// Its own fresh answer (the stage attributed it).
	rerender({ live: theirs, settled: true });
	expect(result.current).toBe(theirs);
});
