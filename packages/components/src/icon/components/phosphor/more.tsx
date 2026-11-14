import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMore(props: SvgProps) {
	return (
		<Svg viewBox="0 0 256 256" {...props}>
			<Path
				fill="currentColor"
				d="M140 128a12 12 0 1 1-12-12 12 12 0 0 1 12 12m-12-56a12 12 0 1 0-12-12 12 12 0 0 0 12 12m0 112a12 12 0 1 0 12 12 12 12 0 0 0-12-12"
			/>
		</Svg>
	);
}
