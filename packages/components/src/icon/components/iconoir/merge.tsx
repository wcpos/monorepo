import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMerge(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4M6 21V7" />
				<Path d="M6 7v2c0 3.5 2.5 9 8.5 9H16M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4" />
			</G>
		</Svg>
	);
}
