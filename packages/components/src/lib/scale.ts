/**
 * The scale-and-density step table (wcpos/roadmap#289, spec #357).
 *
 * The seven scale tokens `apps/main/global.css` declares in `@theme` are the
 * Regular column here; a step is applied by scoping the same seven names to
 * another column. This module is the only place those numbers live, so the
 * gallery cells and the running app cannot disagree — a component reads a
 * utility (`h-ctl`, `min-h-row`, `text-amt`), never the step.
 */

/** The three drawn density steps. */
export type ScaleStep = 'compact' | 'regular' | 'spacious';

/** What a store may store: a step, or Auto (follow the window). */
export type ScaleOverride = 'auto' | ScaleStep;

/** Whether a finger or a mouse is driving, from `usePointer()`. */
export type Pointer = 'coarse' | 'fine';

/**
 * The seven scale tokens, as plain px numbers. A type alias, not an interface:
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
};

/**
 * Per step: spacing unit, body type, control height, row height, tile, radius,
 * amount type — the order the seven tokens are declared in the sheet. Regular
 * is the sheet's own column, so a Regular app scopes nothing new.
 */
export const SCALE_STEPS = {
	compact: [3.5, 13, 40, 36, 56, 6, 34],
	regular: [4, 14, 44, 44, 64, 8, 40],
	spacious: [5, 16, 52, 52, 80, 10, 48],
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
 * The seven values to scope for a step, with the control and row heights
 * floored for the pointer. The tile is never floored — it is already the
 * largest of the three and a floor would flatten Compact's keypad.
 */
export function scaleVariables(step: ScaleStep, pointer: Pointer): ScaleVariables {
	const [spacing, base, ctl, row, tile, radius, amt] = SCALE_STEPS[step];
	const floor = POINTER_FLOORS[pointer];

	return {
		'--spacing': spacing,
		'--text-base': base,
		'--spacing-ctl': Math.max(ctl, floor),
		'--spacing-row': Math.max(row, floor),
		'--spacing-tile': tile,
		'--radius': radius,
		'--text-amt': amt,
	};
}
