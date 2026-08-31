// The old fixed page; also the floor before layout.
export const POS_PRODUCTS_MIN_PAGE_SIZE = 10;
// Server politeness: one Woo page, never more per first request.
export const POS_PRODUCTS_MAX_PAGE_SIZE = 50;

/**
 * Below a tile's square image: two-line name, price, padding. Deliberately LOW — a low
 * estimate asks for one row too many (harmless); a high one leaves a gap.
 */
export const TILE_TEXT_BLOCK_PX = 120;

/** A product table row is ~56px; same low bias as above. */
export const TABLE_ROW_PX = 56;

/**
 * How many products the POS panel should open with: one full screen plus a row.
 *
 * A cashier expects the products panel to be a full shelf — tiles edge to edge, more on
 * scroll, blank space only when there is genuinely nothing more. A fixed first page of 10 is
 * under one screen for both views, so the panel used to fill itself in visible steps
 * (10 → 20 → 30 → 40), each a round trip, and each search extension re-walks from page 1, so
 * 40 tiles cost 100 records. One page sized to the panel is what the cashier expects AND
 * cheaper for the merchant's server; anything past it stays scroll-driven.
 *
 * The estimates are pure geometry from the panel's measured size, deliberately biased LOW: one
 * row too many is harmless, one too few leaves the gap this exists to remove (the end-reached
 * short-content top-up still covers it, at the cost of a stutter).
 */
export function fitPageSize(input: {
	viewMode: 'grid' | 'table';
	width: number;
	height: number;
	/** Tile columns from the UI settings; may be absent until that document resolves. */
	gridColumns: number | undefined;
}): number {
	const { viewMode, width, height, gridColumns } = input;
	if (width <= 0 || height <= 0) return POS_PRODUCTS_MIN_PAGE_SIZE;
	if (viewMode === 'grid' && !(Number.isFinite(gridColumns) && (gridColumns as number) >= 1)) {
		return POS_PRODUCTS_MIN_PAGE_SIZE;
	}

	const size =
		viewMode === 'grid'
			? (gridColumns as number) *
				(Math.ceil(height / (width / (gridColumns as number) + TILE_TEXT_BLOCK_PX)) + 1)
			: Math.ceil(height / TABLE_ROW_PX) + 2;

	return Math.min(
		POS_PRODUCTS_MAX_PAGE_SIZE,
		Math.max(POS_PRODUCTS_MIN_PAGE_SIZE, Math.round(size))
	);
}
