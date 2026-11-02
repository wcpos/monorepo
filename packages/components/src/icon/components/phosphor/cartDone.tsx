import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCartDone(props: SvgProps) {
	return (
		<Svg viewBox="0 0 24 24" {...props}>
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M4 19a2 2 0 1 0 4 0 2 2 0 0 0-4 0" />
				<Path d="M11.5 17H6V3H4" />
				<Path d="m6 5 14 1-1 7H6m9 6 2 2 4-4" />
			</G>
		</Svg>
	);
}
