import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCustomers(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Path d="M3 16V8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Z" />
				<Path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M16.5 14.5s-1.5 2-4.5 2-4.5-2-4.5-2"
				/>
				<Path
					fill="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M8.5 10a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1m7 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1"
				/>
			</G>
		</Svg>
	);
}
