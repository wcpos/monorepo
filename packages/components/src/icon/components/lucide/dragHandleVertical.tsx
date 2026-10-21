import * as React from 'react';

import Svg, { Circle, G } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgDragHandleVertical(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Circle cx={9} cy={12} r={1} />
				<Circle cx={9} cy={5} r={1} />
				<Circle cx={9} cy={19} r={1} />
				<Circle cx={15} cy={12} r={1} />
				<Circle cx={15} cy={5} r={1} />
				<Circle cx={15} cy={19} r={1} />
			</G>
		</Svg>
	);
}
