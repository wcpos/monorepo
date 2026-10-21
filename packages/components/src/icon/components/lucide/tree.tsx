import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgTree(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M8 5h13m-8 7h8m-8 7h8M3 10a2 2 0 0 0 2 2h3" />
				<Path d="M3 5v12a2 2 0 0 0 2 2h3" />
			</G>
		</Svg>
	);
}
