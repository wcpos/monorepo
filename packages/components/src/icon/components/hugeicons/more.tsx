import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMore(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M11.997 12.5V12m0-5.5V6m0 12.5V18m1-5.5a1 1 0 1 0-2 0 1 1 0 0 0 2 0m0-6a1 1 0 1 0-2 0 1 1 0 0 0 2 0m0 12a1 1 0 1 0-2 0 1 1 0 0 0 2 0"
			/>
		</Svg>
	);
}
