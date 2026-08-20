import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgArrowUpRight(props: SvgProps) {
	return (
		<Svg viewBox="0 0 384 512" {...props}>
			<Path d="M320 96c17.7 0 32 14.3 32 32v224c0 17.7-14.3 32-32 32s-32-14.3-32-32V205.3L86.6 425.4c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L261.5 160H96c-17.7 0-32-14.3-32-32s14.3-32 32-32h224z" />
		</Svg>
	);
}
