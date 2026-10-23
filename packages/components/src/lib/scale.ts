/**
 * The scale-and-density step table (wcpos/roadmap#289, spec #357).
 *
 * The nine scale tokens `apps/main/global.css` declares in `@theme` are the
 * Regular column here; a step is applied by scoping the same nine names to
 * another column. This module is the only place those numbers live, so the
 * gallery cells and the running app cannot disagree — a component reads a
 * utility (`h-ctl`, `min-h-row`, `text-amt`), never the step.
 */

/**
 * The page gutter in spacing units; `--spacing-gutter` in global.css carries the same 3 — the
 * CSS cannot read this constant. For code that needs the gutter in px (`GUTTER_UNITS * unit`).
 */
export const GUTTER_UNITS = 3;

/**
 * A band in spacing units; `--spacing-band` in global.css carries the same 7. A band is a label
 * ON a list (the orders day heading), not an item in it: the caption line (12 px type on a 16 px
 * line) with 1.5 units above and below, 28 at Regular, about 64% of a row. The references keep
 * a section heading well under their rows (Up 28, YNAB 26, Monarch 24, Shopify 22; board
 * 2026-10-23). It is not a target, so the pointer floor never lifts it.
 */
export const BAND_UNITS = 7;

/** The three drawn density steps. */
export type ScaleStep = 'compact' | 'regular' | 'spacious';

/** What a store may store: a step, or Auto (follow the window). */
export type ScaleOverride = 'auto' | ScaleStep;

/** Whether a finger or a mouse is driving, from `usePointer()`. */
export type Pointer = 'coarse' | 'fine';

/**
 * The nine scale tokens, as plain px numbers. A type alias, not an interface:
 * `ScopedVariables` takes a record, and only an alias gets the implicit index
 * signature that makes it assignable.
 */
export type ScaleVariables = {
	'--spacing': number;
	'--text-base': number;
	'--spacing-ctl': number;
	'--spacing-row': number;
	'--spacing-tile': number;
	'--radius': number;
	'--text-amt': number;
	'--text-xs': number;
	'--text-2xs': number;
};

/**
 * Per step: spacing unit, body type, control height, row height, tile, radius,
 * amount type, xs type, 2xs type — the order the nine tokens are declared in
 * the sheet. Regular is the sheet's own column, so a Regular app scopes nothing
 * new.
 *
 * The two small sizes are explicit, not a ratio of the body type: a ratio took
 * Compact's xs to 11.1 and 2xs to 10.2, under every platform's floor (Apple HIG
 * Caption 2 is 11 pt; Material and Android's Accessibility Scanner ask for
 * 12 sp; the web convention is 12 px). Apple's and Material's own type tables
 * hold the smallest sizes fixed across size settings and let the large ones
 * move, so Compact keeps Regular's 12 / 11 and only Spacious grows them.
 */
export const SCALE_STEPS = {
	compact: [3.5, 13, 40, 36, 56, 6, 34, 12, 11],
	regular: [4, 14, 44, 44, 64, 8, 40, 12, 11],
	spacious: [5, 16, 52, 52, 80, 10, 48, 14, 13],
} as const satisfies Record<ScaleStep, readonly number[]>;

/**
 * The floor a control and a row may not go under. 44 is the touch target every
 * platform HIG asks for, so Compact on a finger keeps 44 even though it
 * densifies everything else; 24 is WCAG 2.2's minimum for a pointer, which
 * Compact already clears — a mouse gets the real density.
 */
export const POINTER_FLOORS = { coarse: 44, fine: 24 } as const satisfies Record<Pointer, number>;

/** Under this width Auto picks Compact: a phone, in either orientation. */
export const AUTO_COMPACT_UNDER = 640;

/** At this width and above Auto picks Spacious: a desk monitor, not a laptop. */
export const AUTO_SPACIOUS_FROM = 1600;

/**
 * The OS text-size multiplier is capped here. Past 1.3x the keypad and the cart
 * break; spacing, controls and icons ride `--spacing`, which the multiplier
 * never touches, so the cap moves type only.
 */
export const MAX_FONT_SCALE = 1.3;

/**
 * The step to render at. A stored value that is not one of the three steps —
 * 'auto', a typo, a value from a future version — falls back to the window.
 */
export function resolveStep(override: string | undefined | null, extent: number): ScaleStep {
	if (override === 'compact' || override === 'regular' || override === 'spacious') return override;
	if (extent < AUTO_COMPACT_UNDER) return 'compact';
	if (extent >= AUTO_SPACIOUS_FROM) return 'spacious';
	return 'regular';
}

/**
 * The nine values to scope for a step, with the control and row heights
 * floored for the pointer. The tile is never floored — it is already the
 * largest of the three and a floor would flatten Compact's keypad.
 */
export function scaleVariables(step: ScaleStep, pointer: Pointer): ScaleVariables {
	const [spacing, base, ctl, row, tile, radius, amt, xs, xxs] = SCALE_STEPS[step];
	const floor = POINTER_FLOORS[pointer];

	return {
		'--spacing': spacing,
		'--text-base': base,
		'--spacing-ctl': Math.max(ctl, floor),
		'--spacing-row': Math.max(row, floor),
		'--spacing-tile': tile,
		'--radius': radius,
		'--text-amt': amt,
		'--text-xs': xs,
		'--text-2xs': xxs,
	};
}
