import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgDivide(props: SvgProps) {
	return (
		<Svg viewBox="0 0 448 512" {...props}>
			<Path d="M272 96a48 48 0 1 0-96 0 48 48 0 1 0 96 0m0 320a48 48 0 1 0-96 0 48 48 0 1 0 96 0m128-128c17.7 0 32-14.3 32-32s-14.3-32-32-32H48c-17.7 0-32 14.3-32 32s14.3 32 32 32z" />
		</Svg>
	);
}
