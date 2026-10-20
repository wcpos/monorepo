import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgBackspace(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M21 21H9m6.889-6.11L8.464 7.463m-5.571 5.144 9.193-9.193a2 2 0 0 1 2.828 0l4.95 4.95a2 2 0 0 1 0 2.828l-9.243 9.243a1.93 1.93 0 0 1-2.728 0l-5-5a2 2 0 0 1 0-2.828"
			/>
		</Svg>
	);
}
