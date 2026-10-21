import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMessagePlus(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path
					fill="currentColor"
					d="M17 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1m-5 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1m-5 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"
				/>
				<Path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12c0 1.821.487 3.53 1.338 5L2.5 21.5l4.5-.838A9.96 9.96 0 0 0 12 22" />
			</G>
		</Svg>
	);
}
