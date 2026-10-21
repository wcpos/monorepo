import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMoreCircle(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path strokeLinejoin="round" d="M8 12h.009m3.996 0h.008m3.978 0H16" />
				<Circle cx={12} cy={12} r={10} />
			</G>
		</Svg>
	);
}
