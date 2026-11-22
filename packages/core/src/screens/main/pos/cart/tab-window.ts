// Points: every tab remains a touch target even when its label is short.
export const TAB_MIN = 96;
export const PLUS_WIDTH = 48;
// The blank cart borrows the + cell, unfolded into "+ New" (Paul, 2026-10-12).
export const NEW_TAB_WIDTH = 112;
// A store can hold thousands of open orders and every tab subscribes to its record;
// beyond 25 carts either side of the open one, the list is the tool.
export const ROW_REACH = 25;

export function centredOffset({
	rowWidth,
	contentWidth,
	tabX,
	tabWidth,
}: {
	rowWidth: number;
	contentWidth: number;
	tabX: number;
	tabWidth: number;
}): number {
	return Math.max(0, Math.min(tabX + tabWidth / 2 - rowWidth / 2, contentWidth - rowWidth));
}

/**
 * Phone: the row starts at a tab's start, never through a tab. The tab before the active one
 * leads when the active one still fits whole beside it; otherwise the active one leads. The
 * row cannot scroll past its end, so the last carts sit at the far edge.
 */
export function leadingOffset({
	rowWidth,
	contentWidth,
	tabX,
	tabWidth,
	previousX,
}: {
	rowWidth: number;
	contentWidth: number;
	tabX: number;
	tabWidth: number;
	previousX?: number;
}): number {
	const start =
		previousX !== undefined && tabX + tabWidth - previousX <= rowWidth ? previousX : tabX;
	return Math.max(0, Math.min(start, contentWidth - rowWidth));
}

export function rowOverflows({
	stripWidth,
	contentWidth,
}: {
	stripWidth: number;
	contentWidth: number;
}): boolean {
	// Reserve the widest + cell so selecting the blank cart cannot toggle the tray.
	// Never reserve the tray itself: its appearance must not change the fits decision.
	return stripWidth > 0 && contentWidth > stripWidth - NEW_TAB_WIDTH;
}

export function snapOffsets({
	rowWidth,
	contentWidth,
	tabs,
	align = 'centre',
}: {
	rowWidth: number;
	contentWidth: number;
	tabs: readonly { x: number; width: number }[];
	align?: 'centre' | 'start';
}): number[] {
	return [
		...new Set(
			tabs.map(({ x, width }) =>
				align === 'start'
					? Math.max(0, Math.min(x, contentWidth - rowWidth))
					: centredOffset({ rowWidth, contentWidth, tabX: x, tabWidth: width })
			)
		),
	].sort((a, b) => a - b);
}

/** Web reports size changes, not sibling moves: sum widths in mounted order. */
export function tabOffsets(ids: readonly string[], widths: ReadonlyMap<string, number>) {
	const offsets = new Map<string, { x: number; width: number }>();
	let x = 0;
	for (const id of ids) {
		const width = widths.get(id);
		// An unmeasured predecessor makes every subsequent position unknown.
		if (width === undefined) break;
		offsets.set(id, { x, width });
		x += width;
	}
	return offsets;
}
