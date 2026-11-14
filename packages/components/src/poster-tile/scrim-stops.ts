import { Platform } from 'react-native';

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
 * The blur under the words, in px, masked by the same fade so it has no edge. Web draws it with
 * `backdrop-filter`; native cannot mask a live blur, so it draws a blurred copy of the picture
 * under a gradient mask (`@react-native-masked-view/masked-view`) at `SCRIM_BLUR_RADIUS` (roadmap
 * `docs/research/2026-10-13-native-scrim-blur.md`). Not yet judged on a device.
 */
export const SCRIM_BLUR_PX = 6;

/**
 * expo-image's `blurRadius` for the native scrim's blurred copy, so it reads as `SCRIM_BLUR_PX`.
 * iOS: SDImageBlurTransformer blurs at radius / 2, so twice the px. Android: Glide's
 * BlurTransformation blurs after a x4 downsample, so radius x 4 is roughly px; 2 is a first guess,
 * to be judged on the Pixel. Web never mounts the copy.
 */
export const SCRIM_BLUR_RADIUS: number = Platform.select({
	ios: SCRIM_BLUR_PX * 2,
	android: 2,
	default: SCRIM_BLUR_PX,
});

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

/**
 * The scrim's gradient at a measured height (native draws it in fractions of the block): the
 * thirteen stops, then the plateau at the bottom edge, fourteen in all, offsets clamped to [0, 1].
 * `of` is a fraction of the strength: the tint multiplies it by `SCRIM_STRENGTH`, the blur's mask
 * takes it as alpha. One list for both, so the blur fades in exactly with the tint.
 */
export function scrimStopsFor(height: number): { offset: number; of: number }[] {
	if (!(height > 0)) return [];
	return [...SCRIM_STOPS, [height / SCRIM_REACH, 1] as const].map(([at, of]) => ({
		offset: Math.max(0, Math.min(1, (at * SCRIM_REACH) / height)),
		of,
	}));
}

/**
 * The band of card under the square, so every tile is the same height whatever it says: the
 * most common words, one line of name (`text-base`, `leading-tight`: 1.25) and the money row
 * (`text-base` at its 1.35 line height), with the 2 px gap between them and the 10 px foot (three
 * spacing steps), sit wholly on it. In the type scale's own variables, so it grows with the text
 * (owner, 2026-10-13: "I like the band"; board `pos-tile-square-or-band-2026-10-13.html`, 48 px).
 */
export const POSTER_BAND =
	'h-[calc(var(--text-base)*1.25+var(--text-base--line-height)+var(--spacing)*3)]';
