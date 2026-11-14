import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgSplit(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M21 17h-8l-3.5-5H3m18-5h-8l-3.495 5" />
				<Path d="m18 10 3-3-3-3m0 16 3-3-3-3" />
			</G>
		</Svg>
	);
}
