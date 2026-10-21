import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgInventory(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="m7 16.5-5-3 5-3 5 3V19l-5 3z" />
				<Path d="M2 13.5V19l5 3m0-5.455 5-3.03m5 2.985-5-3 5-3 5 3V19l-5 3zM12 19l5 3m0-5.5 5-3m-10 0V8L7 5l5-3 5 3v5.5M7 5.03v5.455M12 8l5-3" />
			</G>
		</Svg>
	);
}
