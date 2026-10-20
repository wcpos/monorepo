import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCustomer(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M5 20v-1a7 7 0 1 1 14 0v1" />
				<Path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />
			</G>
		</Svg>
	);
}
