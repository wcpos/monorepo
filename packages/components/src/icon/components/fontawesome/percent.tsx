import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgPercent(props: SvgProps) {
	return (
		<Svg viewBox="0 0 384 512" {...props}>
			<Path d="M374.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-320 320c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0zM128 128a64 64 0 1 0-128 0 64 64 0 1 0 128 0m256 256a64 64 0 1 0-128 0 64 64 0 1 0 128 0" />
		</Svg>
	);
}
