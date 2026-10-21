import * as React from 'react';

import Svg, { Circle } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgDot(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Circle
				cx={12}
				cy={12}
				r={10}
				fill="none"
				stroke="currentColor"
				strokeLinejoin="round"
				strokeWidth={1.5}
			/>
		</Svg>
	);
}
