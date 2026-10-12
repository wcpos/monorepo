import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { SCRIM_REACH, SCRIM_STOPS, SCRIM_STRENGTH } from './scrim-stops';

export { SCRIM_REACH, SCRIM_STOPS, SCRIM_STRENGTH };

const card = (of: number) =>
	`color-mix(in srgb, var(--card) ${(of * SCRIM_STRENGTH * 100).toFixed(2)}%, transparent)`;

// One CSS gradient: the eased fade over the reach, then flat to the bottom.
const GRADIENT = {
	backgroundImage: `linear-gradient(to bottom, ${[
		...SCRIM_STOPS.map(([at, of]) => `${card(of)} ${at * SCRIM_REACH}px`),
		`${card(1)} 100%`,
	].join(', ')})`,
} as object;

/** The words' block with the card-colour fade behind it (web). */
export function Scrim({ style, ...props }: ViewProps & { className?: string }) {
	return <View {...props} style={[GRADIENT, style]} />;
}
