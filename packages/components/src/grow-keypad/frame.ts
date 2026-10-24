/** Material's minimum touch target (decision 36): every anchored row is this tall. */
export const ROW = 48;

export type Grow = 'down' | 'up';

/**
 * Where the panel opens, measured once per open: `sideOffset` against the trigger's bottom
 * (growing down) or top (growing up). The first row lands on the trigger when the panel fits
 * below it, else above it. In a window it fits neither way, it opens the way with more room
 * and slides along it until every key is inside the window (from the top, if the panel is the
 * taller); only then does the number leave the trigger.
 */
export function growFrame(
	box: { top: number; height: number } | undefined,
	panelHeight: number,
	windowHeight: number
): { grow: Grow; offset: number } {
	const height = box?.height ?? 0;
	const inset = (ROW - height) / 2;
	const offset = -(height + inset);
	if (!box) return { grow: 'down', offset };
	const top = box.top - inset; // the first row's top edge, on the trigger
	const bottom = box.top + height + inset; // and its bottom edge
	if (top + panelHeight <= windowHeight) return { grow: 'down', offset };
	if (bottom - panelHeight >= 0) return { grow: 'up', offset };
	if (windowHeight - top >= bottom) {
		return { grow: 'down', offset: offset + Math.max(0, windowHeight - panelHeight) - top };
	}
	return { grow: 'up', offset: box.top - Math.min(windowHeight, panelHeight) };
}
