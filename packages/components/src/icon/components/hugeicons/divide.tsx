import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgDivide(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M5 12h14m-7 5.875v.375m.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0M12 5.375v.375m.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0"
			/>
		</Svg>
	);
}
