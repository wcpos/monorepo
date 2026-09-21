import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgChevronDown(props: SvgProps) {
	return (
		<Svg
			{...props}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={1.5}
			className="icon icon-tabler icons-tabler-outline icon-tabler-chevron-down"
			viewBox="0 0 24 24"
		>
			<Path stroke="none" d="M0 0h24v24H0z" />
			<Path d="m6 9 6 6 6-6" />
		</Svg>
	);
}
