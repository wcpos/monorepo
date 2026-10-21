import * as React from 'react';

import Svg, { G, Path, Rect } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgLock(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Rect width={18} height={11} x={3} y={11} rx={2} ry={2} />
				<Path d="M7 11V7a5 5 0 0 1 10 0v4" />
			</G>
		</Svg>
	);
}
