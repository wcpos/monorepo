import * as React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import { SCRIM_REACH, SCRIM_STOPS, SCRIM_STRENGTH } from './scrim-stops';

export { SCRIM_REACH, SCRIM_STOPS, SCRIM_STRENGTH };

/**
 * The words' block with the card-colour fade behind it (native). The gradient is drawn at the
 * block's measured height, so the stops are fractions of it and the plateau starts exactly at
 * the words whatever the number of lines.
 */
export function Scrim({ children, ...props }: ViewProps & { className?: string }) {
	const card = String(useCSSVariable('--color-card') ?? '');
	const [height, setHeight] = React.useState(0);
	const id = `poster-scrim-${React.useId().replace(/:/g, '')}`;
	return (
		<View {...props} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
			{height > 0 && (
				<Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
					<Defs>
						<LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
							{/* The fade, then the bottom edge: flat at full strength under the words. */}
							{[...SCRIM_STOPS, [height / SCRIM_REACH, 1] as const].map(([at, of], index) => (
								<Stop
									key={index}
									offset={Math.min(1, (at * SCRIM_REACH) / height)}
									stopColor={card}
									stopOpacity={of * SCRIM_STRENGTH}
								/>
							))}
						</LinearGradient>
					</Defs>
					<Rect width="100%" height="100%" fill={`url(#${id})`} />
				</Svg>
			)}
			{children}
		</View>
	);
}
