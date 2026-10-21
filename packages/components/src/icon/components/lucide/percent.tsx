import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgPercent(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M19 5 5 19" />
				<Circle cx={6.5} cy={6.5} r={2.5} />
				<Circle cx={17.5} cy={17.5} r={2.5} />
			</G>
		</Svg>
	);
}
