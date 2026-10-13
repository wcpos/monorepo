import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { SCRIM_BLUR_PX, SCRIM_REACH, SCRIM_STOPS, SCRIM_STRENGTH } from './scrim-stops';

export { SCRIM_BLUR_PX, SCRIM_REACH, SCRIM_STOPS, SCRIM_STRENGTH };

const card = (of: number) =>
	`color-mix(in srgb, var(--card) ${(of * SCRIM_STRENGTH * 100).toFixed(2)}%, transparent)`;

// One CSS gradient: the eased fade over the reach, then flat to the bottom.
const GRADIENT = {
	backgroundImage: `linear-gradient(to bottom, ${[
		...SCRIM_STOPS.map(([at, of]) => `${card(of)} ${at * SCRIM_REACH}px`),
		`${card(1)} 100%`,
	].join(', ')})`,
} as object;

// The blur fades in exactly with the tint: the same stops, as a mask's alpha.
const MASK = `linear-gradient(to bottom, ${[
	...SCRIM_STOPS.map(([at, of]) => `rgb(0 0 0 / ${of}) ${at * SCRIM_REACH}px`),
	'#000 100%',
].join(', ')})`;
const BLUR = {
	position: 'absolute',
	top: 0,
	right: 0,
	bottom: 0,
	left: 0,
	backdropFilter: `blur(${SCRIM_BLUR_PX}px)`,
	WebkitBackdropFilter: `blur(${SCRIM_BLUR_PX}px)`,
	maskImage: MASK,
	WebkitMaskImage: MASK,
} as object;

/**
 * The words' block with the card-colour fade behind it (web, and Electron), over a blur of the
 * picture under the words. The native one is
 * `scrim.native.tsx`, drawn with react-native-svg: this file is the default so that a runner with
 * no platform (jest) never loads the native renderer. `blur` (native's blurred copy of the
 * picture) is ignored and never mounted: `backdrop-filter` already blurs what is under the block.
 */
export function Scrim({
	style,
	children,
	blur: _blur,
	...props
}: ViewProps & { className?: string; blur?: React.ReactNode }) {
	return (
		<View {...props} style={[GRADIENT, style]}>
			{/* First in the tree, so the words paint above it. */}
			<View pointerEvents="none" style={BLUR} testID="poster-scrim-blur" />
			{children}
		</View>
	);
}
