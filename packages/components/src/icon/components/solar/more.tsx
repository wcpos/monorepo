import * as React from 'react';

import Svg, { Circle, G } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMore(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Circle cx={5} cy={12} r={2} />
				<Circle cx={12} cy={12} r={2} />
				<Circle cx={19} cy={12} r={2} />
			</G>
		</Svg>
	);
}
