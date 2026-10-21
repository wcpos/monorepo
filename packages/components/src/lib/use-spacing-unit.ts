import { useCSSVariable } from 'uniwind';

import { SCALE_STEPS } from './scale';

/** Regular's spacing unit: what a read that finds no step falls back to. */
const REGULAR_SPACING_UNIT = SCALE_STEPS.regular[0];

/**
 * The live spacing unit in px (`--spacing`: 3.5 Compact, 4 Regular, 5 Spacious), for the few
 * sizes that must be a number rather than a class (a navigator's `drawerStyle.width`, a DOM
 * widget's frame). A class (`p-4`, `size-12`) already scales; reach for this only where a
 * number is the only way in.
 *
 * Web returns the computed string (`'4px'`; the scale provider mirrors the step onto
 * `documentElement`), native a number from the scoped Uniwind context, so both are parsed.
 * Anything that is not a finite positive number (tests, SSR, a missing theme) reads as
 * Regular's 4. Kept out of `scale.ts`, which stays pure.
 */
export function useSpacingUnit(): number {
	const spacing = Number.parseFloat(String(useCSSVariable('--spacing')));
	return Number.isFinite(spacing) && spacing > 0 ? spacing : REGULAR_SPACING_UNIT;
}
