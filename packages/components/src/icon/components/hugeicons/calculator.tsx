import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCalculator(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M5.5 3v5M8 5.5H3M8 16l-2 2m0 0-2 2m2-2 2 2m-2-2-2-2M20 6h-4m4 12.5h-4m4-3h-4m6-3.5H2m10 10V2"
			/>
		</Svg>
	);
}
