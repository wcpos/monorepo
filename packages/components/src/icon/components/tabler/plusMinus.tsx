import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgPlusMinus(props: SvgProps) {
	return (
		<Svg
			{...props}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={1.5}
			className="icon icon-tabler icons-tabler-outline icon-tabler-plus-minus"
			viewBox="0 0 24 24"
		>
			<Path stroke="none" d="M0 0h24v24H0z" />
			<Path d="M4 7h6M7 4v6M20 18h-6M5 19 19 5" />
		</Svg>
	);
}
