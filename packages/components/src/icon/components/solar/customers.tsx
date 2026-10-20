import * as React from 'react';

import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCustomers(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Circle cx={9} cy={6} r={4} />
				<Path d="M15 9a3 3 0 1 0 0-6" />
				<Ellipse cx={9} cy={17} rx={7} ry={4} />
				<Path d="M18 14c1.754.385 3 1.359 3 2.5 0 1.03-1.014 1.923-2.5 2.37" />
			</G>
		</Svg>
	);
}
