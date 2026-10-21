import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgRefund(props: SvgProps) {
	return (
		<Svg viewBox="0 0 24 24" {...props}>
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2z" />
				<Path d="M15 14v-2a2 2 0 0 0-2-2H9l2-2m0 4-2-2" />
			</G>
		</Svg>
	);
}
