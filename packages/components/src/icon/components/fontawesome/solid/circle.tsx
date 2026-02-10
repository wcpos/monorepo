import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCircle(props: SvgProps) {
	return (
		<Svg viewBox="0 0 512 512" {...props}>
			<Path d="M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512" />
		</Svg>
	);
}
