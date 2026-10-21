import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgFilters(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M12 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0M4 6h8m4 0h4M6 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0m-2 0h2m4 0h10m-5 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0M4 18h11m4 0h1"
			/>
		</Svg>
	);
}
