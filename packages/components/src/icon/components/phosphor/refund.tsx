import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgRefund(props: SvgProps) {
	return (
		<Svg viewBox="0 0 256 256" {...props}>
			<Path
				fill="currentColor"
				d="M232 144a64.07 64.07 0 0 1-64 64H80a8 8 0 0 1 0-16h88a48 48 0 0 0 0-96H51.31l34.35 34.34a8 8 0 0 1-11.32 11.32l-48-48a8 8 0 0 1 0-11.32l48-48a8 8 0 0 1 11.32 11.32L51.31 80H168a64.07 64.07 0 0 1 64 64"
			/>
		</Svg>
	);
}
