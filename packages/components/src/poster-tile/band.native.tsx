import * as React from 'react';
import { useWindowDimensions, View, type ViewProps } from 'react-native';

import { useCSSVariable } from 'uniwind';

import { MAX_FONT_SCALE } from '../lib/scale';

// The band at the base scale, if the type variables cannot be read as numbers (the board's 48 px).
const BAND_FALLBACK = 48;

/**
 * The band (native): the same four terms as `POSTER_BAND` (one `leading-tight` line of name,
 * one money line at 1.35, the 2 px gap and the 10 px foot), read from the type scale's variables
 * and scaled by the OS text size as `Text` scales the words, capped at `MAX_FONT_SCALE`. A class
 * cannot follow the font scale, so a one-line name and the money row overflowed the band.
 */
export function PosterBand({ style, ...props }: ViewProps & { className?: string }) {
	const { fontScale } = useWindowDimensions();
	const [base, lineHeight, spacing] = useCSSVariable([
		'--text-base',
		'--text-base--line-height',
		'--spacing',
	]).map((value) => Number.parseFloat(String(value)));
	const scale = Math.min(fontScale || 1, MAX_FONT_SCALE);
	const line = Number.isFinite(lineHeight) ? lineHeight : base * 1.35;
	const height =
		Number.isFinite(base) && Number.isFinite(spacing)
			? (base * 1.25 + line) * scale + spacing * 3
			: BAND_FALLBACK * scale;
	return <View {...props} style={[{ height }, style]} />;
}
