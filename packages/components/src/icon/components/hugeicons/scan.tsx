import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgScan(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M16.004 2.5c1.993.113 3.254.434 4.158 1.338s1.225 2.165 1.338 4.158M7.996 2.5c-1.993.113-3.254.434-4.158 1.338S2.613 6.003 2.5 7.996m19 8.008c-.113 1.993-.434 3.254-1.338 4.158s-2.165 1.225-4.158 1.338M2.5 16.004c.113 1.993.434 3.254 1.338 4.158s2.165 1.225 4.158 1.338M5 12h14"
			/>
		</Svg>
	);
}
