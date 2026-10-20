import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgContrast(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0" />
				<Path d="M12 17a5 5 0 0 0 0-10z" />
			</G>
		</Svg>
	);
}
