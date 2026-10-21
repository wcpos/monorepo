import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgGlobe(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0m.6-3h16.8M3.6 15h16.8" />
				<Path d="M11.5 3a17 17 0 0 0 0 18m1-18a17 17 0 0 1 0 18" />
			</G>
		</Svg>
	);
}
