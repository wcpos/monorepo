import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgDragHandle(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M6 8a1 1 0 1 1 0 2 1 1 0 0 1 0-2m0 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2m12-6a1 1 0 1 1 0 2 1 1 0 0 1 0-2m-6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2m6 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2m-6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2"
			/>
		</Svg>
	);
}
