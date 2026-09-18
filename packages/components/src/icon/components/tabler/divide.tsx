import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgDivide(props: SvgProps) {
	return (
		<Svg
			{...props}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={1.5}
			className="icon icon-tabler icons-tabler-outline icon-tabler-divide"
			viewBox="0 0 24 24"
		>
			<Path stroke="none" d="M0 0h24v24H0z" />
			<Path
				fill="currentColor"
				d="M11 6a1 1 0 1 0 2 0 1 1 0 1 0-2 0M11 18a1 1 0 1 0 2 0 1 1 0 1 0-2 0"
			/>
			<Path d="M5 12h14" />
		</Svg>
	);
}
