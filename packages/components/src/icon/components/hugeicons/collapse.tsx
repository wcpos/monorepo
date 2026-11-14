import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCollapse(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M7 19s3.682-5 5-5 5 5 5 5M7 5s3.682 5 5 5 5-5 5-5"
			/>
		</Svg>
	);
}
