import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgWave(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2" />
				<Path d="M6.5 13.5a3 3 0 0 0 5.5 1.659 3 3 0 1 0 2.823-4.642 3 3 0 1 0-5.646 0A3 3 0 0 0 6.5 13.5" />
			</G>
		</Svg>
	);
}
