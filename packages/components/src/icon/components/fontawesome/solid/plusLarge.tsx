import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
const SvgPlusLarge = (props: SvgProps) => (
	<Svg viewBox="0 0 512 512" {...props}>
		<Path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32v192H32c-17.7 0-32 14.3-32 32s14.3 32 32 32h192v192c0 17.7 14.3 32 32 32s32-14.3 32-32V288h192c17.7 0 32-14.3 32-32s-14.3-32-32-32H288z" />
	</Svg>
);
export default SvgPlusLarge;
