/**
 * The tile surface: a card with a hairline border and the 8 pt radius; the selected one takes
 * the primary border on `bg-muted`. `Tile` and `ListItem` (a tile laid out as a row) both read
 * it, so a picked store, printer or payment method looks picked the same way everywhere.
 */
export const TILE_SURFACE = {
	base: 'bg-card rounded-lg border active:bg-muted',
	rest: 'border-border',
	selected: 'border-primary bg-muted',
	dashed: 'border-border border-dashed bg-transparent',
	disabled: 'opacity-50',
} as const;
