import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMerge(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Circle cx={18} cy={18} r={3} />
				<Circle cx={6} cy={6} r={3} />
				<Path d="M6 21V9a9 9 0 0 0 9 9" />
			</G>
		</Svg>
	);
}
