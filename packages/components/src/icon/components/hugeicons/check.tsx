import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCheck(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="m5 13.26 2.586 2.697C8.252 16.652 8.586 17 9 17s.748-.348 1.414-1.043L19 7"
			/>
		</Svg>
	);
}
