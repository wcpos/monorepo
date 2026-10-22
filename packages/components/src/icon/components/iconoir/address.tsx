import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgAddress(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Path d="M20 10c0 4.418-8 12-8 12s-8-7.582-8-12a8 8 0 1 1 16 0Z" />
				<Path
					fill="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M12 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2"
				/>
			</G>
		</Svg>
	);
}
