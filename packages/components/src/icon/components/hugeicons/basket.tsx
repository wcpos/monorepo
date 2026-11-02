import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgBasket(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M8 7h8c1.886 0 2.828 0 3.414.586S20 9.114 20 11v4c0 3.3 0 4.95-1.025 5.975S16.3 22 13 22h-2c-3.3 0-4.95 0-5.975-1.025S4 18.3 4 15v-4c0-1.886 0-2.828.586-3.414S6.114 7 8 7" />
				<Path d="M16 9.5C16 5.634 14.21 2 12 2S8 5.634 8 9.5" />
			</G>
		</Svg>
	);
}
