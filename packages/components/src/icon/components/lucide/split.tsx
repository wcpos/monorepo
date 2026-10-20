import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgSplit(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M16 3h5v5M8 3H3v5" />
				<Path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3m12 6 6-6" />
			</G>
		</Svg>
	);
}
