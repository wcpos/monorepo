import { withDelay } from 'react-native-reanimated';

/**
 * Less than any frame, more than nothing. Reanimated stamps an animation assigned from JS with
 * the time the UI thread RECEIVES it and steps it once at that same time (valueSetter); a delay
 * of 0 passes its own check on that step, so `withDelay(0, …)` starts its clock exactly as an
 * unwrapped one would (independent review, 2026-10-07). A delay above 0 fails that first check,
 * so what it wraps starts on the next real UI frame, with that frame's timestamp.
 */
export const FIRST_FRAME_DELAY = 1;

/**
 * A clock that starts on the first frame the UI thread paints after it was asked for, not when
 * it was received: a heavy commit mounted in between otherwise stamped that first frame well
 * into the curve (Pixel, 2026-10-06: a cross-fade's first changed frame 61–71% through, a walk's
 * 41–59%). Until then the value holds where it was.
 */
export function fromFirstFrame<T>(clock: T): T {
	return withDelay(FIRST_FRAME_DELAY, clock as never) as T;
}
