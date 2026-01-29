import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
const SvgMinus = (props: SvgProps) => (
	<Svg viewBox="0 0 448 512" {...props}>
		<Path d="M432 256c0 17.7-14.3 32-32 32H48c-17.7 0-32-14.3-32-32s14.3-32 32-32h352c17.7 0 32 14.3 32 32" />
	</Svg>
);
export default SvgMinus;
