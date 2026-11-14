import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgIncrement(props: SvgProps) {
	return (
		<Svg viewBox="0 0 256 256" {...props}>
			<Path
				fill="currentColor"
				d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88 88.1 88.1 0 0 1-88 88m48-88a8 8 0 0 1-8 8h-32v32a8 8 0 0 1-16 0v-32H88a8 8 0 0 1 0-16h32V88a8 8 0 0 1 16 0v32h32a8 8 0 0 1 8 8"
			/>
		</Svg>
	);
}
