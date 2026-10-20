import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgShow(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M3 13c3.6-8 14.4-8 18 0" />
				<Path d="M12 17a3 3 0 1 1 0-6 3 3 0 0 1 0 6" />
			</G>
		</Svg>
	);
}
