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
}: {
	rowWidth: number;
	contentWidth: number;
	tabs: readonly { x: number; width: number }[];
}): number[] {
	return [
		...new Set(
			tabs.map(({ x, width }) =>
				centredOffset({ rowWidth, contentWidth, tabX: x, tabWidth: width })
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
