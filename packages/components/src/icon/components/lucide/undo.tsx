import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgUndo(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M3 7v6h6" />
				<Path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
			</G>
		</Svg>
	);
}
