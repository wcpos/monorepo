import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCart(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M10.5 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0m8.5 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0M2 3h.207c1.324 0 1.987 0 2.419.402s.479 1.063.573 2.384l.251 3.519c.142 1.989.213 2.983.515 3.791a6 6 0 0 0 3.931 3.661c.828.243 1.83.243 3.836.243 2.105 0 3.158 0 4.01-.258a6 6 0 0 0 4-4C22 11.89 22 10.843 22 8.75c0-.698 0-1.047-.086-1.33a2 2 0 0 0-1.333-1.334C20.297 6 19.948 6 19.25 6H5.5M16 10v3m-5-3v3"
			/>
		</Svg>
	);
}
