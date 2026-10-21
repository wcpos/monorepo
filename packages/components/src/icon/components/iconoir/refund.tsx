import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgRefund(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M4.5 8H15s5 0 5 4.706C20 18 15 18 15 18H6.286" />
				<Path d="M7.5 11.5 4 8l3.5-3.5" />
			</G>
		</Svg>
	);
}
