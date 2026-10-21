import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgAddToCart(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M4 19a2 2 0 1 0 4 0 2 2 0 0 0-4 0" />
				<Path d="M12.5 17H6V3H4" />
				<Path d="m6 5 14 1-.86 6.017M16.5 13H6m10 6h6m-3-3v6" />
			</G>
		</Svg>
	);
}
