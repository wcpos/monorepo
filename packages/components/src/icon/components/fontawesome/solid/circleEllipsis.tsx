import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
const SvgCircleEllipsis = (props: SvgProps) => (
	<Svg viewBox="0 0 512 512" {...props}>
		<Path d="M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512m-96-288a32 32 0 1 1 0 64 32 32 0 1 1 0-64m64 32a32 32 0 1 1 64 0 32 32 0 1 1-64 0m128-32a32 32 0 1 1 0 64 32 32 0 1 1 0-64" />
	</Svg>
);
export default SvgCircleEllipsis;
