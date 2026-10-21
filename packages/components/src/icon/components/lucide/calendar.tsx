import * as React from 'react';

import Svg, { G, Path, Rect } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCalendar(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			>
				<Path d="M8 2v3m8-3v3" />
				<Rect width={18} height={18} x={3} y={3} rx={2} />
				<Path d="M3 9h18" />
			</G>
		</Svg>
	);
}
