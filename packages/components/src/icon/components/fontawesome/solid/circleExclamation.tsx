import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCircleExclamation(props: SvgProps) {
	return (
		<Svg viewBox="0 0 512 512" {...props}>
			<Path d="M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512m0-384c13.3 0 24 10.7 24 24v112c0 13.3-10.7 24-24 24s-24-10.7-24-24V152c0-13.3 10.7-24 24-24m-32 224a32 32 0 1 1 64 0 32 32 0 1 1-64 0" />
		</Svg>
	);
}
