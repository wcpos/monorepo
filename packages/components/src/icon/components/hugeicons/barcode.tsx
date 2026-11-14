import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgBarcode(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M16.5 5v10M21 5v14M12 5v14M3 5v14M7.5 5v10m9.125 3.75H16.5m.25 0a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0m-9.125 0H7.5m.25 0a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0"
			/>
		</Svg>
	);
}
