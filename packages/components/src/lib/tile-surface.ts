/**
 * The tile surface: a card with a hairline border and the theme radius; the selected one takes
 * the primary border on `bg-muted`. `Tile` and `ListItem` (a tile laid out as a row) both read
 * it, so a picked store, printer or payment method looks picked the same way everywhere. The
 * press, hover and disabled states are the pressable surface's.
 */
export const TILE_SURFACE = {
	base: 'bg-card rounded-tile border',
	rest: 'border-border',
	selected: 'border-primary bg-muted',
	dashed: 'border-border border-dashed bg-transparent',
} as const;
