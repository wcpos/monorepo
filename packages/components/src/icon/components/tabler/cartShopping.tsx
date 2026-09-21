import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCartShopping(props: SvgProps) {
	return (
		<Svg
			{...props}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={1.5}
			className="icon icon-tabler icons-tabler-outline icon-tabler-shopping-cart"
			viewBox="0 0 24 24"
		>
			<Path stroke="none" d="M0 0h24v24H0z" />
			<Path d="M4 19a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 19a2 2 0 1 0 4 0 2 2 0 1 0-4 0" />
			<Path d="M17 17H6V3H4" />
			<Path d="m6 5 14 1-1 7H6" />
		</Svg>
	);
}
