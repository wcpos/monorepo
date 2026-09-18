import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgBoxesStacked(props: SvgProps) {
	return (
		<Svg
			{...props}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={1.5}
			className="icon icon-tabler icons-tabler-outline icon-tabler-packages"
			viewBox="0 0 24 24"
		>
			<Path stroke="none" d="M0 0h24v24H0z" />
			<Path d="m7 16.5-5-3 5-3 5 3V19l-5 3z" />
			<Path d="M2 13.5V19l5 3M7 16.545l5-3.03M17 16.5l-5-3 5-3 5 3V19l-5 3zM12 19l5 3M17 16.5l5-3" />
			<Path d="M12 13.5V8L7 5l5-3 5 3v5.5M7 5.03v5.455M12 8l5-3" />
		</Svg>
	);
}
