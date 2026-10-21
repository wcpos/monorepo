import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgIncrement(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Circle cx={12} cy={12} r={10} />
				<Path d="M15 12h-3m0 0H9m3 0V9m0 3v3" />
			</G>
		</Svg>
	);
}
