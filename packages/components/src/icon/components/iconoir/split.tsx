import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgSplit(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M17 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4M7 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m0 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4M7 7v10M17 7v1c0 2.5-2 3-2 3l-6 2s-2 .5-2 3v1"
			/>
		</Svg>
	);
}
