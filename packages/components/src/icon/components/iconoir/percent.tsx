import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgPercent(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M17 19a2 2 0 1 1 0-4 2 2 0 0 1 0 4M7 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4m12-4L5 19"
			/>
		</Svg>
	);
}
