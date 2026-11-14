import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgEquals(props: SvgProps) {
	return (
		<Svg viewBox="0 0 256 256" {...props}>
			<Path
				fill="currentColor"
				d="M224 160a8 8 0 0 1-8 8H40a8 8 0 0 1 0-16h176a8 8 0 0 1 8 8M40 104h176a8 8 0 0 0 0-16H40a8 8 0 0 0 0 16"
			/>
		</Svg>
	);
}
