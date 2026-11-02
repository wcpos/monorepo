import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgShow(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M10 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0" />
				<Path d="M21 12q-3.6 6-9 6t-9-6q3.6-6 9-6t9 6" />
			</G>
		</Svg>
	);
}
