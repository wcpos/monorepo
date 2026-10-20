import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgDragHandle(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="m7 10.5-2.004 2.672a2 2 0 0 0 .126 2.552l3.784 4.128c.378.413.912.648 1.473.648H15c2.4 0 4-1.5 4-4V7.929M16 8.5v-.571c0-2.286 3-2.286 3 0" />
				<Path d="M13 8.5V7.027m0-.527v.527M16 8.5V7.027c0-2.286-3-2.286-3 0" />
				<Path d="M13 8.5V7.027c0-2.286 3-2.286 3 0V8.5m-6 0v-2c0-2.286 3-2.286 3 0v2m-6 5v-7A1.5 1.5 0 0 1 8.5 5c.828 0 1.5.555 1.5 1.384V8.5" />
			</G>
		</Svg>
	);
}
