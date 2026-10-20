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
				strokeWidth={2}
				d="M12 3v6l3-3M9 6l3 3m0 12v-6l3 3m-6 0 3-3m-8-3h1m4 0h1m4 0h1m4 0h1"
			/>
		</Svg>
	);
}
