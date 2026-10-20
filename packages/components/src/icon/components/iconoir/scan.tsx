import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgScan(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M10 12V6h1m-1 6h1V6m-1 12v-3h1m0 0v3h-1M7 6v6m0 3v3m7-12v6m0 3v3m3-12v6m0 3v3M6 3H3v3m-1 6h20m-4-9h3v3M6 21H3v-3m15 3h3v-3"
			/>
		</Svg>
	);
}
