import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgExpand(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M9 9 4 4m0 0v4m0-4h4m7 5 5-5m0 0v4m0-4h-4M9 15l-5 5m0 0v-4m0 4h4m7-5 5 5m0 0v-4m0 4h-4"
			/>
		</Svg>
	);
}
