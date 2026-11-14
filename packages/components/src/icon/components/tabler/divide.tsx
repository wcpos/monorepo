import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgDivide(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path
					fill="currentColor"
					d="M11 6a1 1 0 1 0 2 0 1 1 0 1 0-2 0m0 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0"
				/>
				<Path d="M5 12h14" />
			</G>
		</Svg>
	);
}
