import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgRegister(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Path d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10Z" />
				<Path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M10 16V9a1 1 0 0 1 1-1h1.75a2.25 2.25 0 0 1 0 4.5H10m3 0 1.5 3.5"
				/>
			</G>
		</Svg>
	);
}
