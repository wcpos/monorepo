import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
const SvgTag = (props: SvgProps) => (
	<Svg viewBox="0 0 448 512" {...props}>
		<Path d="M0 80v149.5c0 17 6.7 33.3 18.7 45.3l176 176c25 25 65.5 25 90.5 0l133.5-133.5c25-25 25-65.5 0-90.5l-176-176c-12-12-28.3-18.7-45.3-18.7H48C21.5 32 0 53.5 0 80m112 32a32 32 0 1 1 0 64 32 32 0 1 1 0-64" />
	</Svg>
);
export default SvgTag;
