import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCart(props: SvgProps) {
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
					d="M19.5 22a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3m-10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3"
				/>
				<Path d="M5 4h17l-2 11H7zm0 0c-.167-.667-1-2-3-2m18 13H5.23c-1.784 0-2.73.781-2.73 2s.946 2 2.73 2H19.5" />
			</G>
		</Svg>
	);
}
