import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMoreCircle(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				d="M21 12a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Zm-7.5 0a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0ZM6 12a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z"
			/>
		</Svg>
	);
}
