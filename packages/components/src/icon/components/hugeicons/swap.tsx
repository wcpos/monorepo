import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgSwap(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M20 17H4m13-3s3 2.21 3 3-3 3-3 3M5 7h15M7 4S4 6.21 4 7s3 3 3 3"
			/>
		</Svg>
	);
}
