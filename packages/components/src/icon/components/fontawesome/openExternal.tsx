import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgOpenExternal(props: SvgProps) {
	return (
		<Svg viewBox="0 0 24 24" {...props}>
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M17 7 7 17M8 7h9v9"
			/>
		</Svg>
	);
}
