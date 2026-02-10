import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCirclePause(props: SvgProps) {
	return (
		<Svg viewBox="0 0 512 512" {...props}>
			<Path d="M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512m-32-320v128c0 17.7-14.3 32-32 32s-32-14.3-32-32V192c0-17.7 14.3-32 32-32s32 14.3 32 32m128 0v128c0 17.7-14.3 32-32 32s-32-14.3-32-32V192c0-17.7 14.3-32 32-32s32 14.3 32 32" />
		</Svg>
	);
}
