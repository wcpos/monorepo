import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgAlert(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Circle cx={12} cy={12} r={10} />
				<Path d="M12 8v4m.125 3.75H12m.25 0a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0" />
			</G>
		</Svg>
	);
}
