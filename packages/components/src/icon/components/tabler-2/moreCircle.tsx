import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMoreCircle(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0m5 0v.01m4-.01v.01m4-.01v.01"
			/>
		</Svg>
	);
}
