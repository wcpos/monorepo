import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCurrency(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M13.744 17.736a6 6 0 1 1-7.48-7.48M15 6h1v4" />
				<Path d="m6.134 14.768.866-.5 2 3.464" />
				<Circle cx={16} cy={8} r={6} />
			</G>
		</Svg>
	);
}
