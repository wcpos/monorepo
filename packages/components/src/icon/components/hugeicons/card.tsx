import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCard(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth={1.5}>
				<Path
					strokeLinecap="round"
					d="M2 12c0-3.537 0-5.306 1.053-6.487q.253-.284.554-.522C4.862 4 6.741 4 10.5 4h3c3.759 0 5.638 0 6.892.99q.302.24.555.523C22 6.693 22 8.463 22 12s0 5.306-1.053 6.487a4.4 4.4 0 0 1-.555.522C19.138 20 17.26 20 13.5 20h-3c-3.759 0-5.638 0-6.893-.99a4.4 4.4 0 0 1-.554-.523C2 17.307 2 15.537 2 12"
				/>
				<Path strokeLinecap="round" strokeMiterlimit={10} d="M10 16h1.5m3 0H18" />
				<Path d="M2 9h20" />
			</G>
		</Svg>
	);
}
