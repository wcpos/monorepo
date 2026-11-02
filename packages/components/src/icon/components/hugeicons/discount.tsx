import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgDiscount(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M15.482 4.033a3.997 3.997 0 0 0-6.965 0 4 4 0 0 0-4.483 4.483 3.998 3.998 0 0 0 0 6.966 4 4 0 0 0 4.483 4.483 3.998 3.998 0 0 0 6.965 0Q15.737 20 16 20a4 4 0 0 0 3.966-4.518 3.997 3.997 0 0 0 0-6.965Q19.999 8.262 20 8a4 4 0 0 0-4.518-3.967M15 9l-6 6" />
				<Path d="M9.375 9.25H9.25m.25 0a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0m5.375 5.5h-.125m.25 0a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0" />
			</G>
		</Svg>
	);
}
