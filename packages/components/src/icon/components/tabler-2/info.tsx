import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgInfo(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0m9-3h.01" />
				<Path d="M11 12h1v4h1" />
			</G>
		</Svg>
	);
}
