import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgStar(props: SvgProps) {
	return (
		<Svg
			{...props}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={1.5}
			className="icon icon-tabler icons-tabler-outline icon-tabler-star"
			viewBox="0 0 24 24"
		>
			<Path stroke="none" d="M0 0h24v24H0z" />
			<Path d="m12 17.75-6.172 3.245 1.179-6.873-5-4.867 6.9-1 3.086-6.253 3.086 6.253 6.9 1-5 4.867 1.179 6.873z" />
		</Svg>
	);
}
