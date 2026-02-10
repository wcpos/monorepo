import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgRectangleBarcode(props: SvgProps) {
	return (
		<Svg viewBox="0 0 576 512" {...props}>
			<Path d="M64 32C28.7 32 0 60.7 0 96v320c0 35.3 28.7 64 64 64h448c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64zm56 96c13.3 0 24 10.7 24 24v208c0 13.3-10.7 24-24 24s-24-10.7-24-24V152c0-13.3 10.7-24 24-24m56 16c0-8.8 7.2-16 16-16s16 7.2 16 16v224c0 8.8-7.2 16-16 16s-16-7.2-16-16zm88-16c13.3 0 24 10.7 24 24v208c0 13.3-10.7 24-24 24s-24-10.7-24-24V152c0-13.3 10.7-24 24-24m88 24c0-13.3 10.7-24 24-24s24 10.7 24 24v208c0 13.3-10.7 24-24 24s-24-10.7-24-24zm112-24c8.8 0 16 7.2 16 16v224c0 8.8-7.2 16-16 16s-16-7.2-16-16V144c0-8.8 7.2-16 16-16" />
		</Svg>
	);
}
