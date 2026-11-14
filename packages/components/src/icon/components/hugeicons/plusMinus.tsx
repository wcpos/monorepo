import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgPlusMinus(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M11 16c0 1.87 0 2.804.402 3.5a3 3 0 0 0 1.098 1.098C13.196 21 14.13 21 16 21s2.804 0 3.5-.402a3 3 0 0 0 1.098-1.098C21 18.804 21 17.87 21 16s0-2.804-.402-3.5a3 3 0 0 0-1.098-1.098C18.804 11 17.87 11 16 11"
				/>
				<Path
					strokeLinejoin="round"
					d="M8 3c1.87 0 2.804 0 3.5.402A3 3 0 0 1 12.598 4.5C13 5.196 13 6.13 13 8s0 2.804-.402 3.5a3 3 0 0 1-1.098 1.098C10.804 13 9.87 13 8 13c-1.869 0-2.804 0-3.5-.402A3 3 0 0 1 3.402 11.5C3 10.804 3 9.87 3 8s0-2.804.402-3.5A3 3 0 0 1 4.5 3.402C5.196 3 6.131 3 8 3Z"
				/>
				<Path strokeLinecap="round" d="M8 6v4m2-2H6m12 8h-4" />
			</G>
		</Svg>
	);
}
