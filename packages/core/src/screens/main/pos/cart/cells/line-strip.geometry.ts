/**
 * The cart line's swipe, as numbers. Everything the strip decides from a position or a
 * release lives here so it can be read and tested without a gesture.
 *
 * A pull has three rests: home, open (Edit · Remove showing) and gone. Between open and gone
 * is the remove point — "the line" — where Remove swallows Edit, the row takes its red and
 * one haptic ticks; let go past it and the line leaves (chosen 2026-10-08).
 */

/**
 * The remove point as a share of the row. Material and Wear commit at a half; our strip
 * already covers 42–47 % of a register column, so a half would leave almost no band between
 * "open" and "remove".
 */
export const REMOVE_SHARE = 0.6;
/** The band is never narrower than this past the open strip, whatever the row width. */
export const REMOVE_BAND = 56;
/** A flick this fast (px/s, leftwards) past the open strip removes without reaching the line. */
export const REMOVE_FLICK = 800;
/** Past the line the Remove label rides this far in from the row's trailing edge. */
export const LABEL_INSET = 20;

/** How far the row has to travel before letting go removes it. */
export function removePoint(rowWidth: number, stripWidth: number): number {
	return Math.max(stripWidth + REMOVE_BAND, Math.round(rowWidth * REMOVE_SHARE));
}

export type Release = 'remove' | 'open' | 'home';

/**
 * Where the row goes when the finger lifts. `revealed` is how far left the row sits (a
 * positive number), `velocityX` the gesture's, leftwards negative.
 */
export function releaseOutcome({
	revealed,
	velocityX,
	rowWidth,
	stripWidth,
}: {
	revealed: number;
	velocityX: number;
	rowWidth: number;
	stripWidth: number;
}): Release {
	if (revealed >= removePoint(rowWidth, stripWidth)) return 'remove';
	if (velocityX <= -REMOVE_FLICK && revealed > stripWidth) return 'remove';
	return revealed > stripWidth / 2 ? 'open' : 'home';
}

/**
 * Edit's travel. It rides with the row's trailing edge once the pull passes the open strip,
 * and slides under the row (its own width further) as Remove swallows it; `swallow` runs 0→1.
 */
export function editOffset(
	revealed: number,
	stripWidth: number,
	editWidth: number,
	swallow: number
): number {
	'worklet';
	// `0 -` rather than a unary minus: a resting offset is 0, never -0.
	return 0 - Math.max(0, revealed - stripWidth) - swallow * editWidth;
}

/**
 * Remove's travel. At rest it is the block at the row's far right; past the line it rides
 * beside the row's trailing edge, `LABEL_INSET` in, and never right of its rest.
 */
export function removeOffset(revealed: number, removeWidth: number, swallow: number): number {
	'worklet';
	return 0 - swallow * Math.max(0, revealed - removeWidth - LABEL_INSET);
}
