import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMoon(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10" />
				<Path d="M12 22c3.314 0 6-4.477 6-10S15.314 2 12 2m-2 12.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0M11.125 7H11m.25 0a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0" />
			</G>
		</Svg>
	);
}
