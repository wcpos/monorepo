import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgDragHandleVertical(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="currentColor"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M12 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1m0 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1m0-16a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"
			/>
		</Svg>
	);
}
