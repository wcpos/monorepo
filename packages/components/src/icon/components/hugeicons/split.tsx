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
				d="M21 8.5V6.6c0-1.697 0-2.546-.527-3.073S19.097 3 17.4 3h-1.9M20 4l-5.5 5.5M3 8.5V6.6c0-1.697 0-2.546.527-3.073S4.903 3 6.6 3h1.9M4 4l5.657 5.657c1.156 1.156 1.734 1.734 2.038 2.47.305.734.305 1.552.305 3.187V21"
			/>
		</Svg>
	);
}
