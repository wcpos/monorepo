import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
const SvgUserCrown = (props: SvgProps) => (
	<Svg viewBox="0 0 448 512" {...props}>
		<Path d="M144 128v16c0 44.2 35.8 80 80 80s80-35.8 80-80v-16zm0-108.8c10.2 7.5 23.8 8.3 34.9 2L209.1 4c4.6-2.6 9.7-4 14.9-4s10.4 1.4 14.9 4l30.2 17.2c11 6.3 24.7 5.5 34.9-2l.1-.1c.3-.2.6-.4.8-.6l3-2.4 15.7-12.6c2.8-2.3 6.4-3.5 10-3.5h2.4c8.8 0 16 7.2 16 16v128c0 70.7-57.3 128-128 128S96 214.7 96 144V16c0-8.8 7.2-16 16-16h2.4c3.6 0 7.2 1.2 10 3.5L140 16l3 2.4c.3.2.6.4.8.6l.1.1zM0 472c0-92.8 75.2-168 168-168h112c92.8 0 168 75.2 168 168v8c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32z" />
	</Svg>
);
export default SvgUserCrown;
