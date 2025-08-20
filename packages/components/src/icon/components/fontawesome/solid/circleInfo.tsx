import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
const SvgCircleInfo = (props: SvgProps) => (
	<Svg viewBox="0 0 512 512" {...props}>
		<Path d="M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512m-40-176h24v-64h-24c-13.3 0-24-10.7-24-24s10.7-24 24-24h48c13.3 0 24 10.7 24 24v88h8c13.3 0 24 10.7 24 24s-10.7 24-24 24h-80c-13.3 0-24-10.7-24-24s10.7-24 24-24m40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64" />
	</Svg>
);
export default SvgCircleInfo;
