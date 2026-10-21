import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMoon(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Circle cx={12} cy={12} r={10} />
				<Path d="M7.633 3.067A3.001 3.001 0 1 1 4.017 6.32M22 13.05a3.5 3.5 0 1 0-3 5.914" />
				<Path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="m14.5 8.51.01-.011M10 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4"
				/>
			</G>
		</Svg>
	);
}
