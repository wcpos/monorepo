import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMoreCircle(props: SvgProps) {
	return (
		<Svg viewBox="0 0 256 256" {...props}>
			<Path
				fill="currentColor"
				d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88 88.1 88.1 0 0 1-88 88m12-88a12 12 0 1 1-12-12 12 12 0 0 1 12 12m44 0a12 12 0 1 1-12-12 12 12 0 0 1 12 12m-88 0a12 12 0 1 1-12-12 12 12 0 0 1 12 12"
			/>
		</Svg>
	);
}
