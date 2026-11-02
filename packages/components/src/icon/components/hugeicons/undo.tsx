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
				strokeWidth={1.5}
			>
				<Path d="M3.499 14.966a9 9 0 0 0 8.5 6.034 9 9 0 1 0 0-18c-3.7 0-7.1 2.676-8.31 5.5" />
				<Path d="M11.999 7v5l3 2M7.498 8.744s-3.684.559-4.243 0c-.56-.56 0-4.243 0-4.243" />
			</G>
		</Svg>
	);
}
