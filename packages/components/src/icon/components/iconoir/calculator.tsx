import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCalculator(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Path d="M1 21V3a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2Z" />
				<Path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M15 7h4m-4 8.5h4m-4 3h4M5 7h2m2 0H7m0 0V5m0 2v2m-1.414 9.414L7 17m1.415-1.414L7 17m0 0-1.414-1.414M7 17l1.415 1.414"
				/>
			</G>
		</Svg>
	);
}
