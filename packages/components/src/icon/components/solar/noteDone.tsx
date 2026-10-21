import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgNoteDone(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path strokeLinejoin="round" d="M6 16.5 7.333 18 10 15" />
				<Path d="M13 2.263V5c0 2.357 0 3.536.732 4.268S15.643 10 18 10h3.58" />
				<Path
					strokeLinejoin="round"
					d="M3.171 3.172C4.343 2 6.24 2 10.03 2c1.525 0 2.287 0 2.98.266.691.265 1.255.773 2.383 1.788l3.959 3.562c1.304 1.174 1.956 1.761 2.302 2.538S22 11.808 22 13.563V14c0 3.771 0 5.657-1.172 6.828S17.771 22 14 22H9.997c-3.77 0-5.654 0-6.825-1.172S2 17.771 2 14V9.998c0-3.77 0-5.655 1.171-6.826"
				/>
			</G>
		</Svg>
	);
}
