// Literal classes, so the stylesheet keeps them.
export const TINTS = [
	'bg-tile-tint-0',
	'bg-tile-tint-1',
	'bg-tile-tint-2',
	'bg-tile-tint-3',
	'bg-tile-tint-4',
	'bg-tile-tint-5',
] as const;
// The two cards under a stacked tile, inside the 8 px the two `m-1` margins leave between tiles.
export const NEAR = { top: 3, left: 3, right: -3, bottom: -3 };
export const FAR = { top: 6, left: 6, right: -6, bottom: -6, opacity: 0.6 };
export const CARD = 'bg-card border-border absolute rounded-lg border';
export const CIRCLE =
	'bg-card border-border size-6 items-center justify-center rounded-full border';
