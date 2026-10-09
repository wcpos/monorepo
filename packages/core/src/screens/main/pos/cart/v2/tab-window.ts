/**
 * The open-cart strip shows whole tabs only (Paul, 2026-10-09): a tab is as wide as its text
 * (never narrower than TAB_MIN), and a cart that does not fit is hidden, never cut. The
 * arrows are the only sign of more. Nothing is cut, so there is no edge fade, and a hovered
 * tab is one clean rectangle.
 *
 * Fits: every cart in a row from the left, no tray, no arrows.
 * Overflow: the tray and the arrows appear, and the row fills outwards from the open cart,
 * a neighbour to the right then one to the left, as long as whole tabs fit. The first and
 * last carts can only grow one way, so they sit at that edge with only the far arrow.
 */

// Points. The narrowest tab: a short amount still makes a target, and a row of short
// amounts does not turn into a picket fence.
export const TAB_MIN = 96;
// The count badge and its chevron, inside a full-height cell.
export const TRAY_WIDTH = 56;
export const ARROW_WIDTH = 36;
export const PLUS_WIDTH = 48;

export type TabWindow = {
	/** Every cart fits: no tray, no arrows. */
	fits: boolean;
	/** Index of the first visible cart. */
	start: number;
	/** Index after the last visible cart. */
	end: number;
	tray: boolean;
	/** A cart is hidden before the window. */
	left: boolean;
	/** A cart is hidden after the window. */
	right: boolean;
};

export function tabWindow({
	width,
	widths,
	active,
}: {
	/** The strip's measured width. */
	width: number;
	/** Every tab's own width, in strip order. */
	widths: readonly number[];
	/** Index of the open cart. */
	active: number;
}): TabWindow {
	const count = widths.length;
	const row = width - PLUS_WIDTH;
	if (count === 0) return { fits: true, start: 0, end: 0, tray: false, left: false, right: false };
	if (widths.reduce((sum, w) => sum + w, 0) <= row) {
		return { fits: true, start: 0, end: count, tray: false, left: false, right: false };
	}
	const index = Math.min(Math.max(active, 0), count - 1);
	// Which arrows show depends on the window, and the window's room depends on which arrows
	// show. Start from the open cart's position and settle; one more pass is enough because
	// dropping an arrow only ever widens the window.
	let left = index > 0;
	let right = index < count - 1;
	let start = index;
	let end = index + 1;
	for (let pass = 0; pass < 3; pass += 1) {
		const available = row - TRAY_WIDTH - (left ? ARROW_WIDTH : 0) - (right ? ARROW_WIDTH : 0);
		start = index;
		end = index + 1;
		let used = widths[index];
		let grew = true;
		while (grew) {
			grew = false;
			if (end < count && used + widths[end] <= available) {
				used += widths[end];
				end += 1;
				grew = true;
			}
			if (start > 0 && used + widths[start - 1] <= available) {
				used += widths[start - 1];
				start -= 1;
				grew = true;
			}
		}
		const nextLeft = start > 0;
		const nextRight = end < count;
		if (nextLeft === left && nextRight === right) break;
		left = nextLeft;
		right = nextRight;
	}
	return { fits: false, start, end, tray: true, left, right };
}
