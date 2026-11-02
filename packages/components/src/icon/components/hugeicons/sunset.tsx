import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgSunset(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M16 12.494a4 4 0 0 0-8 0M4 18.5h10m-10-3h16m-10 6h10M2 12.495h2m16 0h2M11.995 4.5v-2m5.658 4.34 1.415-1.414M6.34 6.848 4.925 5.434"
			/>
		</Svg>
	);
}
