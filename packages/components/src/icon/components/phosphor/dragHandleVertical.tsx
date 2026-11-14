import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgDragHandleVertical(props: SvgProps) {
	return (
		<Svg viewBox="0 0 256 256" {...props}>
			<Path
				fill="currentColor"
				d="M104 60a12 12 0 1 1-12-12 12 12 0 0 1 12 12m60 12a12 12 0 1 0-12-12 12 12 0 0 0 12 12m-72 44a12 12 0 1 0 12 12 12 12 0 0 0-12-12m72 0a12 12 0 1 0 12 12 12 12 0 0 0-12-12m-72 68a12 12 0 1 0 12 12 12 12 0 0 0-12-12m72 0a12 12 0 1 0 12 12 12 12 0 0 0-12-12"
			/>
		</Svg>
	);
}
