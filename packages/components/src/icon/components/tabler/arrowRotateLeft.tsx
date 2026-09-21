import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgArrowRotateLeft(props: SvgProps) {
	return (
		<Svg
			{...props}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={1.5}
			className="icon icon-tabler icons-tabler-outline icon-tabler-history"
			viewBox="0 0 24 24"
		>
			<Path stroke="none" d="M0 0h24v24H0z" />
			<Path d="M12 8v4l2 2" />
			<Path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
		</Svg>
	);
}
