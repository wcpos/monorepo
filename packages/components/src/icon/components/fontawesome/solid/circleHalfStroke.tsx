import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
const SvgCircleHalfStroke = (props: SvgProps) => (
	<Svg viewBox="0 0 512 512" {...props}>
		<Path d="M448 256c0-106-86-192-192-192v384c106 0 192-86 192-192M0 256a256 256 0 1 1 512 0 256 256 0 1 1-512 0" />
	</Svg>
);
export default SvgCircleHalfStroke;
