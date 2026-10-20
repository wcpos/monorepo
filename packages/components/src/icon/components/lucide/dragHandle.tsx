import * as React from 'react';

import Svg, { Circle, G } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgDragHandle(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Circle cx={12} cy={9} r={1} />
				<Circle cx={19} cy={9} r={1} />
				<Circle cx={5} cy={9} r={1} />
				<Circle cx={12} cy={15} r={1} />
				<Circle cx={19} cy={15} r={1} />
				<Circle cx={5} cy={15} r={1} />
			</G>
		</Svg>
	);
}
