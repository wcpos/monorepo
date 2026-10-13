/**
 * The Poster tile's scrim, decided 2026-10-12 as "card colour, eased, 85, 48" (wcpos/roadmap
 * `docs/specs/2026-10-12-pos-product-tile-poster-spec.md` § The scrim). Constants, not settings.
 */

/** How far above the first line of words the fade reaches, in px. */
export const SCRIM_REACH = 48;

/**
 * The card colour's opacity under the words: the plateau the fade eases up to. Owner,
 * 2026-10-13: "around 90 or 92", after 85 read thin over busy pictures.
 */
export const SCRIM_STRENGTH = 0.92;

/**
 * The blur under the words, in px, masked by the same fade so it has no edge. Drawn on web only
 * until native can mask a blur (research in progress: roadmap
 * `docs/research/2026-10-13-native-scrim-blur.md` when it lands).
 */
export const SCRIM_BLUR_PX = 6;

/**
 * The fade, top-down, as `[at, of]`: `at` a fraction of the reach, `of` a fraction of the
 * strength (an ease-in curve). Under the last stop the scrim is flat at full strength.
 */
export const SCRIM_STOPS: readonly (readonly [at: number, of: number])[] = [
	[0, 0],
	[0.018, 0.002],
	[0.048, 0.008],
	[0.09, 0.021],
	[0.139, 0.042],
	[0.198, 0.075],
	[0.27, 0.126],
	[0.35, 0.194],
	[0.435, 0.278],
	[0.53, 0.382],
	[0.66, 0.541],
	[0.81, 0.738],
	[1, 1],
];
